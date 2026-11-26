import { EQ_BANDS } from '../store/player'
import type { Settings } from '../types'

export const audio = new Audio()
audio.crossOrigin = 'anonymous'
audio.preload = 'auto'

// Graph: source → trackGain → dry → out              (EQ off: clean path, no filters)
//                          ↘ preamp → EQ → wet → out  (EQ on, crossfaded so switching never clicks)
let ctx: AudioContext | null = null
let trackGain: GainNode
let dry: GainNode
let wet: GainNode
let preamp: GainNode
let filters: BiquadFilterNode[] = []
let wetConnected = false
let bypassToken = 0
let settings: Settings | null = null
let trackLevel = 1

const RAMP = 0.015

// Same formula as loudnessGain() in electron/zsquality.ts.
const loudnessGain = (db: number | null | undefined) => (db != null && db > 0 ? Math.pow(10, -db / 20) : 1)

function setParam(p: AudioParam, v: number) {
  p.setTargetAtTime(v, ctx!.currentTime, RAMP)
}

function graph(): AudioContext {
  if (ctx) return ctx
  // 48 kHz is Opus's native rate: no resampling inside the graph.
  const c = new AudioContext({ latencyHint: 'playback', sampleRate: 48000 })
  const source = c.createMediaElementSource(audio)
  trackGain = c.createGain()
  dry = c.createGain()
  wet = c.createGain()
  wet.gain.value = 0
  preamp = c.createGain()
  filters = EQ_BANDS.map((freq, i) => {
    const f = c.createBiquadFilter()
    f.type = i === 0 ? 'lowshelf' : i === EQ_BANDS.length - 1 ? 'highshelf' : 'peaking'
    f.frequency.value = freq
    f.Q.value = 1
    return f
  })
  source.connect(trackGain)
  trackGain.connect(dry)
  dry.connect(c.destination)
  preamp.connect(filters[0])
  filters.slice(1).forEach((f, i) => filters[i].connect(f))
  filters[filters.length - 1].connect(wet)
  wet.connect(c.destination)
  ctx = c
  apply()
  return c
}

function apply() {
  if (!ctx || !settings) return
  const eqOn = settings.eqEnabled
  const gains = eqOn ? settings.eq : EQ_BANDS.map(() => 0)
  if (eqOn && !wetConnected) {
    trackGain.connect(preamp)
    wetConnected = true
  }
  filters.forEach((f, i) => setParam(f.gain, gains[i] ?? 0))
  // Lower the input by the biggest boost so EQ never clips.
  setParam(preamp.gain, Math.pow(10, -Math.max(0, ...gains) / 20))
  setParam(dry.gain, eqOn ? 0 : 1)
  setParam(wet.gain, eqOn ? 1 : 0)
  setParam(trackGain.gain, settings.normalize ? trackLevel : 1)
  if (!eqOn && wetConnected) {
    // Drop the EQ branch once its fade-out is done so it costs no CPU.
    const token = ++bypassToken
    setTimeout(() => {
      if (token !== bypassToken || settings?.eqEnabled || !wetConnected) return
      trackGain.disconnect(preamp)
      wetConnected = false
    }, 120)
  }
}

export function applySettings(s: Settings) {
  settings = s
  apply()
}

// Called when the main process reports the stream actually playing; keeps the previous level until then.
export function setStreamMeta(meta: { quality: string; loudnessDb: number | null } | null) {
  if (!meta) return
  trackLevel = loudnessGain(meta.loudnessDb)
  apply()
}

export function load(videoId: string, quality: string, startAt = 0) {
  graph()
  audio.src = `zsa://stream/${videoId}?q=${quality}`
  if (startAt > 0) audio.addEventListener('loadedmetadata', () => { audio.currentTime = startAt }, { once: true })
}

export function unload() {
  audio.removeAttribute('src')
  audio.load()
}

export async function play() {
  await graph().resume()
  await audio.play()
}

export function setVolume(volume: number, muted: boolean) {
  audio.volume = muted ? 0 : volume * volume
}
