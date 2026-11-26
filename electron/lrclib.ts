// Time-synced lyrics from LRCLIB (open lyrics database, no key). Falls back to null so the caller can show plain lyrics.
export interface LyricLine { time: number; text: string }

const UA = { 'User-Agent': 'Zsound (https://github.com/2dekur/ZS)' }
const cache = new Map<string, LyricLine[] | null>()

export function parseLrc(lrc: string): LyricLine[] {
  const lines: LyricLine[] = []
  for (const row of lrc.split(/\r?\n/)) {
    const stamps = [...row.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)]
    const text = row.replace(/\[[^\]]*\]/g, '').trim()
    for (const s of stamps) lines.push({ time: Number(s[1]) * 60 + Number(s[2]), text })
  }
  return lines.sort((a, b) => a.time - b.time)
}

const clean = (s: string) => s.replace(/\s*[([].*?[)\]]\s*/g, ' ').replace(/\s+-\s+.*$/, '').trim()

export async function syncedLyrics(key: string, t: { title: string; artist: string; duration: number }): Promise<LyricLine[] | null> {
  if (cache.has(key)) return cache.get(key)!
  const artist = t.artist.split(',')[0].trim()
  const title = clean(t.title)
  let lrc: string | null = null
  try {
    const q = new URLSearchParams({ artist_name: artist, track_name: title, ...(t.duration ? { duration: String(Math.round(t.duration)) } : {}) })
    const r = await fetch(`https://lrclib.net/api/get?${q}`, { headers: UA, signal: AbortSignal.timeout(6000) })
    if (r.ok) lrc = ((await r.json()) as any)?.syncedLyrics ?? null
    if (!lrc) {
      const found = (await (await fetch(`https://lrclib.net/api/search?${new URLSearchParams({ q: `${artist} ${title}` })}`, { headers: UA, signal: AbortSignal.timeout(6000) })).json()) as any[]
      lrc = found.find((f) => f.syncedLyrics && (!t.duration || Math.abs(f.duration - t.duration) <= 4))?.syncedLyrics ?? null
    }
  } catch { /* offline or LRCLIB down: plain lyrics fallback */ }
  const lines = lrc ? parseLrc(lrc) : null
  cache.set(key, lines?.length ? lines : null)
  return cache.get(key)!
}
