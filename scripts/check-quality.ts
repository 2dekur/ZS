// Self-check for electron/zsquality.ts: pnpm check:quality
import assert from 'node:assert/strict'
import { pick, describe, loudnessGain } from '../electron/zsquality.ts'

const fmt = (itag: number, codec: string, kbps: number) => ({
  itag, codec, kbps, url: `https://x/${itag}`, mime: codec === 'Opus' ? 'audio/webm' : 'audio/mp4', sampleRate: codec === 'Opus' ? 48000 : 44100, size: 1, headers: {},
})
const all = [fmt(139, 'AAC', 49), fmt(140, 'AAC', 130), fmt(249, 'Opus', 50), fmt(250, 'Opus', 70), fmt(251, 'Opus', 139)]
const zs = { formats: all, loudnessDb: 4, expires: 0, engine: 'zs' as const }
const fb = { ...zs, engine: 'fallback' as const }
const itag = (r: typeof zs | typeof fb, q: 'low' | 'normal' | 'high' | 'zs') => pick(r, q)?.itag

assert.equal(itag(zs, 'low'), 249)
assert.equal(itag(zs, 'normal'), 250)
assert.equal(itag(zs, 'high'), 140)
assert.equal(itag(zs, 'zs'), 251)
assert.equal(itag({ ...zs, formats: [...all, fmt(774, 'Opus', 256)] }, 'zs'), 774)

// ZS Quality is exclusive to the ZS Engine: fallback streams play and report High.
assert.equal(itag(fb, 'zs'), 140)
assert.equal(describe(fb, pick(fb, 'zs')!, 'zs').quality, 'high')
assert.equal(describe(zs, pick(zs, 'zs')!, 'zs').quality, 'zs')
assert.deepEqual(describe(zs, pick(zs, 'zs')!, 'zs'), { quality: 'zs', codec: 'Opus', kbps: 139, sampleRate: 48000, loudnessDb: 4, engine: 'zs', itag: 251 })

// ZS Engine with only AAC (e.g. iOS client) has no Opus: ZS falls back to High honestly.
const aacOnly = { ...zs, formats: [fmt(139, 'AAC', 49), fmt(140, 'AAC', 130)] }
assert.equal(itag(aacOnly, 'zs'), 140)
assert.equal(describe(aacOnly, pick(aacOnly, 'zs')!, 'zs').quality, 'high')

// Missing preferred itags: nearest bitrate wins, never null.
assert.equal(itag(aacOnly, 'low'), 139)
assert.equal(itag(aacOnly, 'normal'), 140)
assert.equal(itag({ ...zs, formats: [fmt(251, 'Opus', 139)] }, 'low'), 251)
assert.equal(itag({ ...zs, formats: [fmt(250, 'Opus', 70), fmt(251, 'Opus', 139)] }, 'high'), 251)
assert.equal(pick({ ...zs, formats: [] }, 'zs'), null)

assert.equal(loudnessGain(null), 1)
assert.equal(loudnessGain(undefined), 1)
assert.equal(loudnessGain(-3), 1)
assert.equal(loudnessGain(0), 1)
assert.ok(Math.abs(loudnessGain(6) - 0.5012) < 1e-4)
assert.ok(Math.abs(loudnessGain(20) - 0.1) < 1e-9)

// Loudness compensation: none at full volume, grows as volume drops, never exceeds the volume cut.
const { loudnessCompensation } = await import('../src/audio/zsloudness.ts')
assert.deepEqual(loudnessCompensation(1), { bass: 0, treble: 0 })
assert.deepEqual(loudnessCompensation(0), { bass: 0, treble: 0 })
const half = loudnessCompensation(0.5)
assert.ok(Math.abs(half.bass - 3.01) < 0.01 && Math.abs(half.treble - 0.963) < 0.01)
for (const v of [0.05, 0.1, 0.3, 0.6, 0.9]) {
  const c = loudnessCompensation(v)
  const cut = -40 * Math.log10(v)
  assert.ok(c.bass < cut && c.treble < cut && c.bass <= 9 && c.treble <= 3)
}

console.log('ZS Quality OK')
