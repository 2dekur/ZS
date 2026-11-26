// ZS Engine: Zsound's own stream resolver. Talks to YouTube's player API directly
// (two parallel ~50 ms requests); yt-dlp is only a last-resort fallback.
import fs from 'fs'
import path from 'path'
import { ensureVisitor, refreshVisitor, locale } from './ytmusic'
import { fallbackFormats, initFallback } from './ytdlp'

export interface AudioFormat {
  itag: number
  url: string
  mime: string
  codec: string
  kbps: number
  sampleRate: number
  size: number
  headers: Record<string, string>
}

export interface Resolved {
  formats: AudioFormat[]
  loudnessDb: number | null
  expires: number
  engine: 'zs' | 'fallback'
}

interface Client { id: number; client: Record<string, string | number> }

// Clients that need neither a PO token nor the JS player (see yt-dlp INNERTUBE_CLIENTS).
// visionos serves Opus 249/250/251 but needs visitorData; ios_producer serves AAC 139/140 + loudness.
const VISIONOS: Client = {
  id: 101,
  client: {
    clientName: 'VISIONOS', clientVersion: '1.02', deviceMake: 'Apple', deviceModel: 'RealityDevice17,1',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
    osName: 'visionOS', osVersion: '26.5.23O471',
  },
}
const IOS_PRODUCER: Client = {
  id: 92,
  client: {
    clientName: 'IOS_PRODUCER', clientVersion: '0.147.945', deviceMake: 'Apple', deviceModel: 'iPhone16,2',
    userAgent: 'com.google.ios.youtubeproducer/0.147.945 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)',
    osName: 'iPhone', osVersion: '18.3.2.22D82',
  },
}
const ua = (c: Client) => String(c.client.userAgent)

async function player(c: Client, videoId: string, visitorData?: string | null): Promise<any> {
  const { hl, gl } = locale()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': ua(c),
    'X-YouTube-Client-Name': String(c.id),
    'X-YouTube-Client-Version': String(c.client.clientVersion),
    Origin: 'https://www.youtube.com',
  }
  if (visitorData) headers['X-Goog-Visitor-Id'] = visitorData
  const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      context: { client: { ...c.client, hl, gl, ...(visitorData ? { visitorData } : {}) } },
      videoId,
      contentCheckOk: true,
      racyCheckOk: true,
    }),
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`player ${c.client.clientName} HTTP ${res.status}`)
  return res.json()
}

const playable = (j: any) => j?.playabilityStatus?.status === 'OK'
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export function parseFormats(j: any, userAgent: string): AudioFormat[] {
  return (j?.streamingData?.adaptiveFormats ?? [])
    .filter((f: any) => f.url && String(f.mimeType ?? '').startsWith('audio/'))
    .map((f: any) => {
      const mime = String(f.mimeType)
      return {
        itag: Number(f.itag),
        url: f.url,
        mime: mime.split(';')[0],
        codec: /opus/i.test(mime) ? 'Opus' : /mp4a/i.test(mime) ? 'AAC' : mime.match(/codecs="([^"]+)"/)?.[1] ?? 'unknown',
        kbps: Math.round(Number(f.averageBitrate ?? f.bitrate) / 1000) || 0,
        sampleRate: Number(f.audioSampleRate) || 0,
        size: Number(f.contentLength) || 0,
        headers: { 'User-Agent': userAgent },
      }
    })
}

function expiryOf(formats: AudioFormat[]): number {
  const now = Date.now()
  const exps = formats
    .map((f) => { try { return Number(new URL(f.url).searchParams.get('expire')) * 1000 } catch { return 0 } })
    .filter((n) => n > now)
  return (exps.length ? Math.min(...exps) : now + 5 * 3600_000) - 10 * 60_000
}

async function resolveFresh(videoId: string): Promise<Resolved | null> {
  let visitor = await ensureVisitor().catch(() => null)
  const [vis, ios] = await Promise.allSettled([player(VISIONOS, videoId, visitor), player(IOS_PRODUCER, videoId)])
  let vj = vis.status === 'fulfilled' ? vis.value : null
  const ij = ios.status === 'fulfilled' ? ios.value : null
  if (vj?.playabilityStatus?.status === 'LOGIN_REQUIRED') {
    visitor = await refreshVisitor().catch(() => null)
    vj = await player(VISIONOS, videoId, visitor).catch(() => null)
  }
  const visF = playable(vj) ? parseFormats(vj, ua(VISIONOS)) : []
  const iosF = playable(ij) ? parseFormats(ij, ua(IOS_PRODUCER)) : []
  const formats = [...visF, ...iosF.filter((f) => !visF.some((v) => v.itag === f.itag))]
  const loudnessDb = num(ij?.playerConfig?.audioConfig?.loudnessDb) ?? num(vj?.playerConfig?.audioConfig?.loudnessDb)
  if (formats.length) return { formats, loudnessDb, expires: expiryOf(formats), engine: 'zs' }

  const fb = await fallbackFormats(videoId)
  if (fb?.length) return { formats: fb, loudnessDb, expires: expiryOf(fb), engine: 'fallback' }
  return null
}

// --- cache (memory + disk) ---
const MAX_CACHE = 500
const cache = new Map<string, Resolved>()
const inflight = new Map<string, Promise<Resolved | null>>()
let cacheFile: string | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null

function remember(id: string, r: Resolved) {
  cache.delete(id)
  cache.set(id, r)
  if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value as string)
}

function loadCache() {
  if (!cacheFile) return
  try {
    const entries: [string, Resolved][] = JSON.parse(fs.readFileSync(cacheFile, 'utf8'))
    for (const [id, r] of entries) {
      if (Array.isArray(r?.formats) && r.formats.length && r.expires > Date.now()) remember(id, r)
    }
  } catch { /* first run or old format */ }
}

function scheduleSave() {
  if (!cacheFile || saveTimer) return
  const file = cacheFile
  saveTimer = setTimeout(() => {
    saveTimer = null
    const live = [...cache.entries()].filter(([, r]) => r.expires > Date.now())
    const tmp = `${file}.tmp`
    fs.writeFile(tmp, JSON.stringify(live), (err) => {
      if (err) return console.error('[zs-engine] cache write', err.message)
      fs.rename(tmp, file, (e) => { if (e) console.error('[zs-engine] cache rename', e.message) })
    })
  }, 2000)
  saveTimer.unref?.()
}

export function resolve(videoId: string, opts: { force?: boolean } = {}): Promise<Resolved | null> {
  const hit = cache.get(videoId)
  if (!opts.force && hit && hit.expires > Date.now()) return Promise.resolve(hit)
  const running = inflight.get(videoId)
  if (running) return running
  const p = resolveFresh(videoId)
    .then((r) => {
      if (r) { remember(videoId, r); scheduleSave() } else cache.delete(videoId)
      return r
    })
    .catch((e) => {
      console.error('[zs-engine]', videoId, (e as Error).message)
      return null
    })
    .finally(() => inflight.delete(videoId))
  inflight.set(videoId, p)
  return p
}

export function prefetch(videoId: string): void {
  void resolve(videoId)
}

export function initEngine(opts: { userData: string; bundledYtdlp: string }): void {
  cacheFile = path.join(opts.userData, 'stream-cache.json')
  loadCache()
  ensureVisitor().catch((e) => console.error('[zs-engine] warmup', (e as Error).message))
  initFallback(opts)
}
