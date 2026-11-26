import type { AudioFormat, Resolved } from './zsengine'

export type Quality = 'low' | 'normal' | 'high' | 'zs'

export interface StreamMeta {
  quality: Quality // effective tier actually played
  codec: string
  kbps: number
  sampleRate: number
  loudnessDb: number | null
  engine: 'zs' | 'fallback'
  itag: number
}

// Preferred YouTube itags per tier, then nearest bitrate if none exist.
const PREFS: Record<Exclude<Quality, 'zs'>, { itags: number[]; targetKbps: number }> = {
  low: { itags: [249, 139], targetKbps: 50 },
  normal: { itags: [250, 249, 140], targetKbps: 70 },
  high: { itags: [140, 251], targetKbps: 128 },
}

const isOpus = (f: AudioFormat) => /opus/i.test(f.codec) || /webm/i.test(f.mime)

// ZS Quality only exists on ZS Engine streams with an Opus source; anything else is the High tier.
function zsAvailable(r: Resolved) {
  return r.engine === 'zs' && r.formats.some(isOpus)
}

export function pick(r: Resolved, q: Quality): AudioFormat | null {
  if (!r.formats.length) return null
  if (q === 'zs' && zsAvailable(r)) {
    return r.formats.filter(isOpus).reduce((a, b) => (b.kbps > a.kbps ? b : a))
  }
  const tier = PREFS[q === 'zs' ? 'high' : q]
  for (const itag of tier.itags) {
    const f = r.formats.find((x) => x.itag === itag)
    if (f) return f
  }
  return r.formats.reduce((a, b) => (Math.abs(b.kbps - tier.targetKbps) < Math.abs(a.kbps - tier.targetKbps) ? b : a))
}

export function describe(r: Resolved, f: AudioFormat, requested: Quality): StreamMeta {
  return {
    quality: requested === 'zs' && !zsAvailable(r) ? 'high' : requested,
    codec: f.codec,
    kbps: f.kbps,
    sampleRate: f.sampleRate,
    loudnessDb: r.loudnessDb,
    engine: r.engine,
    itag: f.itag,
  }
}

// YouTube reports how many dB a track sits above its loudness reference; only ever attenuate so nothing clips.
export function loudnessGain(db: number | null | undefined): number {
  return db != null && db > 0 ? Math.pow(10, -db / 20) : 1
}
