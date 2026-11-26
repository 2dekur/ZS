// Imports a Spotify / Deezer / YouTube playlist or album from its link and matches every track on YouTube Music.
import { search, collection, type Track } from './ytmusic'

export interface SourceItem { title: string; artist: string; duration: number }
export interface ImportResult { name: string; tracks: Track[]; missed: SourceItem[] }

type Link = { service: 'spotify' | 'deezer'; kind: 'playlist' | 'album'; id: string } | { service: 'youtube'; id: string }

export function parseLink(raw: string): Link | null {
  let u: URL
  try { u = new URL(raw.trim()) } catch { return null }
  const host = u.hostname.replace(/^www\./, '')
  const parts = u.pathname.split('/').filter(Boolean)
  if (host === 'open.spotify.com') {
    const i = parts.findIndex((p) => p === 'playlist' || p === 'album')
    if (i >= 0 && /^\w+$/.test(parts[i + 1] ?? '')) return { service: 'spotify', kind: parts[i] as 'playlist' | 'album', id: parts[i + 1] }
  }
  if (host === 'deezer.com') {
    const i = parts.findIndex((p) => p === 'playlist' || p === 'album')
    if (i >= 0 && /^\d+$/.test(parts[i + 1] ?? '')) return { service: 'deezer', kind: parts[i] as 'playlist' | 'album', id: parts[i + 1] }
  }
  if (host === 'music.youtube.com' || host === 'youtube.com' || host === 'm.youtube.com') {
    const list = u.searchParams.get('list')
    if (list && /^[\w-]+$/.test(list)) return { service: 'youtube', id: `VL${list}` }
    if (parts[0] === 'browse' && /^MPRE[\w-]+$/.test(parts[1] ?? '')) return { service: 'youtube', id: parts[1] }
  }
  return null
}

async function spotify(kind: string, id: string): Promise<{ name: string; items: SourceItem[] }> {
  const html = await (await fetch(`https://open.spotify.com/embed/${kind}/${id}`, { headers: { 'User-Agent': 'Mozilla/5.0' } })).text()
  const json = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)?.[1]
  const entity = json && JSON.parse(json)?.props?.pageProps?.state?.data?.entity
  if (!entity?.trackList) throw new Error('spotify: playlist not found or private')
  return {
    name: entity.name ?? entity.title ?? 'Spotify',
    items: entity.trackList.map((t: any) => ({ title: String(t.title ?? ''), artist: String(t.subtitle ?? '').split(',')[0].trim(), duration: Math.round((t.duration ?? 0) / 1000) })),
  }
}

async function deezer(kind: string, id: string): Promise<{ name: string; items: SourceItem[] }> {
  const j: any = await (await fetch(`https://api.deezer.com/${kind}/${id}`)).json()
  if (j.error) throw new Error(`deezer: ${j.error.message ?? 'not found'}`)
  const data: any[] = [...(j.tracks?.data ?? [])]
  for (let next = j.tracks?.next, n = 0; next && n < 20; n++) {
    const page: any = await (await fetch(next)).json()
    data.push(...(page.data ?? []))
    next = page.next
  }
  return { name: j.title ?? 'Deezer', items: data.map((t) => ({ title: String(t.title ?? ''), artist: String(t.artist?.name ?? ''), duration: Number(t.duration) || 0 })) }
}

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\(.*?\)|\[.*?\]/g, ' ').replace(/feat\.?.*$/, ' ').replace(/[^a-z0-9]+/g, ' ').trim()

// Higher is better: same title words, same artist, duration within a few seconds.
export function score(item: SourceItem, t: Track): number {
  const want = new Set(norm(item.title).split(' ').filter(Boolean))
  const got = norm(t.title).split(' ').filter(Boolean)
  const titleHit = want.size ? got.filter((w) => want.has(w)).length / want.size : 0
  const artistHit = norm(t.artist).includes(norm(item.artist).split(' ')[0] ?? '') ? 1 : 0
  const gap = item.duration && t.duration ? Math.abs(item.duration - t.duration) : 30
  return titleHit * 2 + artistHit + (gap <= 3 ? 1.5 : gap <= 10 ? 0.8 : 0)
}

async function match(item: SourceItem): Promise<Track | null> {
  const results = (await search(`${item.title} ${item.artist}`).catch(() => [] as Track[])).slice(0, 6)
  if (!results.length) return null
  const best = results.reduce((a, b) => (score(item, b) > score(item, a) ? b : a))
  return score(item, best) >= 2 ? best : null
}

export async function importLink(raw: string, onProgress: (done: number, total: number) => void): Promise<ImportResult> {
  const link = parseLink(raw)
  if (!link) throw new Error('unsupported link')
  if (link.service === 'youtube') {
    const page = await collection(link.id)
    onProgress(page.tracks.length, page.tracks.length)
    return { name: page.title, tracks: page.tracks, missed: [] }
  }
  const src = link.service === 'spotify' ? await spotify(link.kind, link.id) : await deezer(link.kind, link.id)
  const out: (Track | null)[] = new Array(src.items.length).fill(null)
  let done = 0
  let cursor = 0
  const worker = async () => {
    while (cursor < src.items.length) {
      const i = cursor++
      out[i] = await match(src.items[i])
      onProgress(++done, src.items.length)
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker))
  return {
    name: src.name,
    tracks: out.filter((t): t is Track => t !== null),
    missed: src.items.filter((_, i) => !out[i]),
  }
}
