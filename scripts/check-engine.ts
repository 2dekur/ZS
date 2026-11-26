// Live smoke test for the ZS Engine: pnpm check:engine  (node --no-warnings scripts/check-engine.ts)
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Source files import siblings without extensions (Vite style); let Node find the .ts.
registerHooks({
  resolve(spec, ctx, next) {
    if (/^\.\.?\//.test(spec) && !path.extname(spec)) {
      try { return next(`${spec}.ts`, ctx) } catch { /* fall through */ }
    }
    return next(spec, ctx)
  },
})

const engine = await import('../electron/zsengine.ts')
const fallback = await import('../electron/ytdlp.ts')

// Fallback parser: keeps audio-only http formats, maps codecs and headers.
const sample = JSON.stringify([
  { format_id: '137', url: 'https://v/1', vcodec: 'avc1', acodec: 'none', protocol: 'https', ext: 'mp4' },
  { format_id: '233', url: 'https://v/2', vcodec: 'none', acodec: 'mp4a.40.5', protocol: 'm3u8_native', ext: 'mp4' },
  { format_id: '251', url: 'https://v/3', vcodec: 'none', acodec: 'opus', protocol: 'https', ext: 'webm', abr: 138.67, asr: 48000, filesize: 2087703, http_headers: { 'User-Agent': 'x' } },
  { format_id: '140', url: 'https://v/4', vcodec: 'none', acodec: 'mp4a.40.2', protocol: 'https', ext: 'm4a', abr: 129.6, asr: 44100 },
])
const parsed = fallback.parseFallbackFormats(`noise line\n${sample}`)
assert.deepEqual(parsed.map((f) => [f.itag, f.codec, f.kbps, f.sampleRate]), [[251, 'Opus', 139, 48000], [140, 'AAC', 130, 44100]])
assert.equal(parsed[0].headers['User-Agent'], 'x')
assert.deepEqual(parsed[1].headers, {})
console.log('fallback parser OK')

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'zs-engine-'))
engine.initEngine({ userData, bundledYtdlp: 'E:\\ZS\\resources\\bin\\ytdlp\\yt-dlp.exe' })

const ids = ['kJQP7kiw5Fk', 'uY9d_eT6tRs', 'fJ9rUzIMcZQ', 'Zi_XLOBDo_Y', '60ItHLz5WEA']
for (const id of ids) {
  let t = performance.now()
  const r = await engine.resolve(id)
  const resolveMs = Math.round(performance.now() - t)
  assert.ok(r, `${id} resolved`)
  assert.equal(r.engine, 'zs', `${id} native engine`)
  const opus = r.formats.find((f) => f.itag === 251)
  const aac = r.formats.find((f) => f.itag === 140)
  assert.ok(opus && opus.codec === 'Opus' && opus.kbps > 100, `${id} Opus 251`)
  assert.ok(aac && aac.codec === 'AAC', `${id} AAC 140`)
  assert.equal(typeof r.loudnessDb, 'number', `${id} loudnessDb`)
  assert.ok(r.expires > Date.now() + 3600_000, `${id} expiry`)

  t = performance.now()
  const res = await fetch(opus.url, { headers: { ...opus.headers, Range: 'bytes=0-65535' } })
  const bytes = (await res.arrayBuffer()).byteLength
  const firstMs = Math.round(performance.now() - t)
  assert.equal(res.status, 206, `${id} range GET`)
  assert.equal(bytes, 65536)

  t = performance.now()
  const again = await engine.resolve(id)
  const cacheMs = performance.now() - t
  assert.equal(again, r, `${id} cache hit`)
  assert.ok(cacheMs < 5)
  console.log(`${id}  resolve ${resolveMs} ms  first64k ${firstMs} ms  cache ${cacheMs.toFixed(2)} ms  formats ${r.formats.map((f) => `${f.itag}:${f.codec}${f.kbps}k`).join(' ')}  loud ${r.loudnessDb?.toFixed(1)} dB`)
}

// prefetch dedupes with the in-flight resolve
engine.prefetch('dQw4w9WgXcQ')
const pre = await engine.resolve('dQw4w9WgXcQ')
assert.equal(pre?.engine, 'zs')

// unavailable video: no throw, null result
const t0 = performance.now()
const missing = await engine.resolve('xxxxxxxxxxx')
console.log(`unavailable video -> ${missing === null ? 'null' : missing.engine} (${Math.round(performance.now() - t0)} ms, includes yt-dlp fallback attempt)`)

await new Promise((r) => setTimeout(r, 2300))
const saved = JSON.parse(fs.readFileSync(path.join(userData, 'stream-cache.json'), 'utf8'))
assert.ok(ids.every((id) => saved.some(([k]: [string]) => k === id)), 'cache persisted')
fs.rmSync(userData, { recursive: true, force: true })
console.log('ZS ENGINE OK')
