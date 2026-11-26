// ZS recommendation algorithm: blends several YouTube Music radios, scores every candidate against the
// listener's profile, then orders them so the same artist never dominates. Pure: no I/O, testable.
import type { Track } from '../types'

export type AlgoMode = 'style' | 'balanced' | 'discover'

export interface Profile {
  likedArtists: Set<string>
  knownArtists: Set<string>
  recentIds: Set<string>
  skippedTracks: Record<string, number>
  skippedArtists: Record<string, number>
}

const VARIANT = /\b(slowed|sped ?up|reverb|nightcore|8d|karaoke|instrumental|acapella|a cappella|bass ?boost(ed)?|1 hour|10 hours)\b/i

export const primaryArtist = (t: Track) => t.artist.split(',')[0].trim().toLowerCase()

export function trackKey(t: Track) {
  const title = t.title
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/\s-\s.*$/, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  return `${title}|${primaryArtist(t)}`
}

const SETTINGS: Record<AlgoMode, { likedBonus: number; novelty: number; seedArtistMax: number; gap: number; consensus: number }> = {
  style: { likedBonus: 0.6, novelty: -0.2, seedArtistMax: 3, gap: 1, consensus: 0.25 },
  balanced: { likedBonus: 0.4, novelty: 0.15, seedArtistMax: 2, gap: 2, consensus: 0.3 },
  discover: { likedBonus: 0, novelty: 0.7, seedArtistMax: 1, gap: 4, consensus: 0.15 },
}

// radios[0] is the main seed's radio; later radios come from other seeds (likes, recents).
export function buildMix(seed: Track, radios: Track[][], profile: Profile, mode: AlgoMode, limit = 30): Track[] {
  const cfg = SETTINGS[mode]
  const seedArtist = primaryArtist(seed)
  const allowVariants = VARIANT.test(seed.title)
  const best = new Map<string, { track: Track; score: number }>()

  radios.forEach((list, r) => {
    const weight = r === 0 ? 1 : mode === 'style' ? 0.45 : mode === 'balanced' ? 0.8 : 0.9
    list.forEach((t, rank) => {
      if (t.id === seed.id || profile.recentIds.has(t.id)) return
      if (!allowVariants && VARIANT.test(t.title)) return
      if ((profile.skippedTracks[t.id] ?? 0) >= 2) return
      const key = trackKey(t)
      if (key === trackKey(seed)) return
      const artist = primaryArtist(t)
      let score = weight / (1 + rank * 0.08)
      if (profile.likedArtists.has(artist)) score += cfg.likedBonus
      if (!profile.knownArtists.has(artist)) score += cfg.novelty
      score -= 0.8 * (profile.skippedTracks[t.id] ?? 0)
      score -= 0.3 * Math.min(3, profile.skippedArtists[artist] ?? 0)
      const prev = best.get(key)
      if (prev) prev.score += cfg.consensus // several radios agree: stronger signal
      else best.set(key, { track: t, score })
    })
  })

  const pool = [...best.values()].sort((a, b) => b.score - a.score)
  const out: Track[] = []
  let seedArtistCount = 0
  const allowed = (t: Track) => primaryArtist(t) !== seedArtist || seedArtistCount < cfg.seedArtistMax
  while (out.length < limit && pool.length) {
    const recent = out.slice(-cfg.gap).map(primaryArtist)
    let i = pool.findIndex(({ track }) => !recent.includes(primaryArtist(track)) && allowed(track))
    if (i < 0) i = pool.findIndex(({ track }) => allowed(track))
    if (i < 0) break
    const [{ track }] = pool.splice(i, 1)
    if (primaryArtist(track) === seedArtist) seedArtistCount++
    out.push(track)
  }
  return out
}

// Seeds for the extra radios: style sticks to the current artist, the other modes mix in likes and recents.
export function pickSeeds(current: Track, liked: Track[], recent: Track[], mode: AlgoMode): Track[] {
  const pool = [...liked.slice(0, 20), ...recent.slice(1, 15)].filter((t) => t.id !== current.id)
  const sameArtist = pool.filter((t) => primaryArtist(t) === primaryArtist(current))
  const other = pool.filter((t) => primaryArtist(t) !== primaryArtist(current))
  if (mode === 'style') return [...sameArtist, ...other].slice(0, 1)
  if (mode === 'discover') return shuffle(other).slice(0, 2)
  return [...other.slice(0, 3), ...sameArtist].slice(0, 2)
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
