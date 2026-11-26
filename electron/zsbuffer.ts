// ZS Buffer: keeps audio bytes in RAM so play, seek and skip never wait on the network.
// Hovered/upcoming tracks get their first 256 KB, the playing and next track are loaded whole.
import { net } from 'electron'
import type { AudioFormat } from './zsengine'

const HEAD_BYTES = 256 * 1024
const BUDGET_BYTES = 48 * 1024 * 1024

interface Entry {
  url: string
  headers: Record<string, string>
  mime: string
  size: number
  data: Buffer
  received: number
  limit: number
  task: Promise<void> | null
  error: Error | null
  waiters: Set<() => void>
  readers: number
  lastUsed: number
}

const entries = new Map<string, Entry>()

function notify(e: Entry) {
  for (const w of e.waiters) w()
  e.waiters.clear()
}

function grow(e: Entry, bytes: number) {
  if (e.data.length >= bytes) return
  const next = Buffer.allocUnsafe(bytes)
  e.data.copy(next, 0, 0, e.received)
  e.data = next
}

function evict() {
  let total = 0
  for (const e of entries.values()) total += e.data.length
  if (total <= BUDGET_BYTES) return
  const idle = [...entries.entries()].filter(([, e]) => e.readers === 0 && !e.task).sort((a, b) => a[1].lastUsed - b[1].lastUsed)
  for (const [key, e] of idle) {
    if (total <= BUDGET_BYTES) break
    total -= e.data.length
    entries.delete(key)
  }
}

async function run(e: Entry) {
  try {
    while (e.received < Math.min(e.limit, e.size)) {
      const end = Math.min(e.limit, e.size) - 1
      grow(e, end + 1)
      const res = await net.fetch(e.url, { headers: { ...e.headers, Range: `bytes=${e.received}-${end}` } })
      if (res.status !== 206 && res.status !== 200) throw new Error(`HTTP ${res.status}`)
      const reader = res.body!.getReader()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        const n = Math.min(value.byteLength, e.data.length - e.received)
        Buffer.from(value.buffer, value.byteOffset, n).copy(e.data, e.received)
        e.received += n
        notify(e)
      }
    }
  } catch (err) {
    e.error = err as Error
  } finally {
    e.task = null
    notify(e)
    evict()
  }
}

function entry(key: string, f: AudioFormat): Entry | null {
  if (!f.size) return null // fallback streams without a known length are proxied directly
  let e = entries.get(key)
  if (e && (e.error || e.url !== f.url) && !e.task && e.readers === 0) {
    entries.delete(key)
    e = undefined
  }
  if (!e) {
    e = {
      url: f.url, headers: f.headers, mime: f.mime || 'audio/webm', size: f.size,
      data: Buffer.alloc(0), received: 0, limit: 0, task: null, error: null, waiters: new Set(), readers: 0, lastUsed: Date.now(),
    }
    entries.set(key, e)
  }
  e.lastUsed = Date.now()
  return e
}

function want(key: string, f: AudioFormat, bytes: number) {
  const e = entry(key, f)
  if (!e || e.error) return
  e.limit = Math.max(e.limit, Math.min(bytes, e.size))
  if (!e.task && e.received < e.limit) e.task = run(e)
}

export const warm = (key: string, f: AudioFormat) => want(key, f, HEAD_BYTES)
export const fill = (key: string, f: AudioFormat) => want(key, f, Number.MAX_SAFE_INTEGER)

function parseRange(header: string | null, size: number): [number, number] {
  const m = header?.match(/bytes=(\d*)-(\d*)/)
  if (!m) return [0, size - 1]
  if (!m[1]) return [Math.max(0, size - Number(m[2])), size - 1]
  return [Number(m[1]), m[2] ? Math.min(Number(m[2]), size - 1) : size - 1]
}

// Serves a Range request from memory (waiting for bytes still arriving). Returns null when the
// range is far ahead of the download, so the caller proxies that seek straight from the network.
export function serve(key: string, f: AudioFormat, rangeHeader: string | null): Response | null {
  const e = entry(key, f)
  if (!e || e.error) return null
  const [start, end] = parseRange(rangeHeader, e.size)
  if (start > end) return null
  const reachable = start < e.received || (e.task !== null && start < e.limit && start - e.received < 512 * 1024)
  if (!reachable) return null

  let pos = start
  e.readers++
  let released = false
  const release = () => { if (!released) { released = true; e.readers--; e.lastUsed = Date.now() } }

  const body = new ReadableStream<Uint8Array>({
    async pull(ctrl) {
      try {
        while (pos <= end) {
          if (pos < e.received) {
            const stop = Math.min(e.received, end + 1, pos + 256 * 1024)
            ctrl.enqueue(new Uint8Array(e.data.subarray(pos, stop)))
            pos = stop
            return
          }
          if (e.error || (!e.task && e.received < e.size)) {
            // Download stopped early: finish this response straight from the network.
            const res = await net.fetch(e.url, { headers: { ...e.headers, Range: `bytes=${pos}-${end}` } })
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const reader = res.body!.getReader()
            for (;;) {
              const { done, value } = await reader.read()
              if (done) break
              ctrl.enqueue(value)
              pos += value.byteLength
            }
            break
          }
          await new Promise<void>((r) => e.waiters.add(r))
        }
        release()
        ctrl.close()
      } catch (err) {
        release()
        ctrl.error(err)
      }
    },
    cancel() { release() },
  })

  return new Response(body, {
    status: 206,
    headers: {
      'Content-Type': e.mime,
      'Content-Length': String(end - start + 1),
      'Content-Range': `bytes ${start}-${end}/${e.size}`,
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    },
  })
}

export function stats() {
  let bytes = 0
  for (const e of entries.values()) bytes += e.data.length
  return { tracks: entries.size, mb: Math.round(bytes / 1048576) }
}
