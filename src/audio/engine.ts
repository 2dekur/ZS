import { EQ_BANDS } from '../store/player'
import type { Settings } from '../types'
import { loudnessCompensation } from './zsloudness'

// Two decks: the next track loads on the idle deck so it can crossfade in (or start with no gap).
// Graph: deck.el → source → level (per-track loudness) → fade → compLow → compHigh → dry → out
//                                                                               ↘ preamp → EQ → wet → out
interface Deck { el: HTMLAudioElement; level: GainNode; fade: GainNode; id: string | null; quality: string }

const FORWARDED = ['timeupdate', 'progress', 'durationchange', 'emptied', 'playing', 'waiting', 'ended', 'error', 'loadedmetadata', 'pause'] as const

/** Events from whichever deck is playing (the Player and controller listen here). */
export const events = new EventTarget()

const els = [new Audio(), new Audio()]
for (const el of els) {
  el.crossOrigin = 'anonymous'
  el.preload = 'auto'
}
let decks: Deck[] = []
let active = 0
for (const [i, el] of els.entries()) {
  for (const type of FORWARDED) el.addEventListener(type, () => { if (i === active) events.dispatchEvent(new Event(type)) })
}

/** The element currently playing (for currentTime, duration, buffered). */
export const current = () => els[active]

let ctx: AudioContext | null = null
let compLow: BiquadFilterNode
let compHigh: BiquadFilterNode
let dry: GainNode
let wet: GainNode
let preamp: GainNode
let filters: BiquadFilterNode[] = []
let wetConnected = false
let bypassToken = 0
let settings: Settings | null = null
let uiVolume = 1
let fadeTimer: ReturnType<typeof setTimeout> | undefined
let idleTimer: ReturnType<typeof setTimeout> | undefined
const levels = new Map<string, number>()

const RAMP = 0.015
// Same formula as loudnessGain() in electron/zsquality.ts.
const loudnessGain = (db: number | null | undefined) => (db != null && db > 0 ? Math.pow(10, -db / 20) : 1)
const levelOf = (id: string | null) => (settings?.normalize && id ? levels.get(id) ?? 1 : 1)

function setParam(p: AudioParam, v: number) {
  p.setTargetAtTime(v, ctx!.currentTime, RAMP)
}

function graph(): AudioContext {
  if (ctx) return ctx
  // 48 kHz is Opus's native rate: no resampling inside the graph.
  const c = new AudioContext({ latencyHint: 'playback', sampleRate: 48000 })
  compLow = c.createBiquadFilter()
  compLow.type = 'lowshelf'
  compLow.frequency.value = 105
  compHigh = c.createBiquadFilter()
  compHigh.type = 'highshelf'
  compHigh.frequency.value = 9000
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
  decks = els.map((el, i) => {
    const level = c.createGain()
    const fade = c.createGain()
    fade.gain.value = i === active ? 1 : 0
    c.createMediaElementSource(el).connect(level)
    level.connect(fade)
    fade.connect(compLow)
    return { el, level, fade, id: null, quality: '' }
  })
  compLow.connect(compHigh)
  compHigh.connect(dry)
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
    compHigh.connect(preamp)
    wetConnected = true
  }
  for (const d of decks) setParam(d.level.gain, levelOf(d.id))
  const comp = decks[active]?.quality === 'zs' && settings.zsLoudness !== false ? loudnessCompensation(uiVolume) : { bass: 0, treble: 0 }
  setParam(compLow.gain, comp.bass)
  setParam(compHigh.gain, comp.treble)
  filters.forEach((f, i) => setParam(f.gain, gains[i] ?? 0))
  // Lower the input by the biggest boost so EQ never clips.
  setParam(preamp.gain, Math.pow(10, -Math.max(0, ...gains) / 20))
  setParam(dry.gain, eqOn ? 0 : 1)
  setParam(wet.gain, eqOn ? 1 : 0)
  if (!eqOn && wetConnected) {
    // Drop the EQ branch once its fade-out is done so it costs no CPU.
    const token = ++bypassToken
    setTimeout(() => {
      if (token !== bypassToken || settings?.eqEnabled || !wetConnected) return
      compHigh.disconnect(preamp)
      wetConnected = false
    }, 120)
  }
}

export function applySettings(s: Settings) {
  settings = s
  apply()
}

// Called when the main process reports a track's stream (quality + measured loudness).
export function setStreamMeta(id: string, meta: { quality: string; loudnessDb: number | null } | null) {
  if (!meta) return
  levels.set(id, loudnessGain(meta.loudnessDb))
  for (const d of decks) if (d.id === id) d.quality = meta.quality
  apply()
}

function prepareDeck(d: Deck, videoId: string, quality: string, startAt: number) {
  d.id = videoId
  d.quality = quality
  if (ctx) d.level.gain.value = levelOf(videoId)
  d.el.src = `zsa://stream/${videoId}?q=${quality}`
  if (startAt > 0) d.el.addEventListener('loadedmetadata', () => { d.el.currentTime = startAt }, { once: true })
}

/** Loads a track on the playing deck (normal play, skip, quality change). */
export function load(videoId: string, quality: string, startAt = 0) {
  graph()
  clearTimeout(fadeTimer)
  const idle = decks[1 - active]
  idle.el.pause()
  idle.fade.gain.cancelScheduledValues(0)
  idle.fade.gain.value = 0
  decks[active].fade.gain.cancelScheduledValues(0)
  decks[active].fade.gain.value = 1
  prepareDeck(decks[active], videoId, quality, startAt)
}

/** Loads the upcoming track on the idle deck, paused, so the handoff is instant. */
export function arm(videoId: string, quality: string) {
  graph()
  const idle = decks[1 - active]
  if (idle.id === videoId && idle.quality === quality && idle.el.src) return
  idle.el.pause()
  prepareDeck(idle, videoId, quality, 0)
}

export const armedId = () => (decks.length ? decks[1 - active].id : null)

/** Switches to the armed deck: crossfades over `seconds` (equal power), or cuts with no gap at 0. */
export async function handoff(seconds: number) {
  const c = graph()
  const from = decks[active]
  const to = decks[1 - active]
  active = 1 - active
  const now = c.currentTime
  from.fade.gain.cancelScheduledValues(now)
  to.fade.gain.cancelScheduledValues(now)
  if (seconds > 0.05) {
    const steps = 64
    const fadeIn = new Float32Array(steps)
    const fadeOut = new Float32Array(steps)
    const start = from.fade.gain.value
    for (let i = 0; i < steps; i++) {
      const x = i / (steps - 1)
      fadeIn[i] = Math.sin((x * Math.PI) / 2)
      fadeOut[i] = Math.cos((x * Math.PI) / 2) * start
    }
    to.fade.gain.setValueCurveAtTime(fadeIn, now, seconds)
    from.fade.gain.setValueCurveAtTime(fadeOut, now, seconds)
  } else {
    to.fade.gain.setValueAtTime(1, now)
    from.fade.gain.setValueAtTime(0, now)
  }
  for (const type of ['durationchange', 'timeupdate'] as const) events.dispatchEvent(new Event(type))
  clearTimeout(idleTimer)
  await c.resume()
  await to.el.play()
  apply()
  clearTimeout(fadeTimer)
  fadeTimer = setTimeout(() => {
    from.el.pause()
    from.el.removeAttribute('src')
    from.el.load()
    from.id = null
  }, seconds * 1000 + 200)
}

export function unload() {
  for (const el of els) {
    el.removeAttribute('src')
    el.load()
  }
  for (const d of decks) d.id = null
}

// Build the graph at launch but keep it suspended: first play skips AudioContext setup, idle costs no CPU.
export function prepare() {
  void graph().suspend()
}

export async function play() {
  clearTimeout(idleTimer)
  await graph().resume()
  await current().play()
}

// Release the audio device after a while on pause so an idle Zsound uses no CPU.
export function pause() {
  for (const el of els) el.pause()
  clearTimeout(idleTimer)
  idleTimer = setTimeout(() => { if (current().paused) void ctx?.suspend() }, 15_000)
}

export function setVolume(volume: number, muted: boolean) {
  uiVolume = volume
  for (const el of els) el.volume = muted ? 0 : volume * volume
  apply()
}
