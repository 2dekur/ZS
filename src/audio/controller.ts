import { getDefaultStore } from 'jotai'
import * as engine from './engine'
import { buildMix, pickSeeds, primaryArtist, type Profile } from './algo'
import {
  currentTrackAtom, isPlayingAtom, isBufferingAtom, streamMetaAtom, playTokenAtom, settingsAtom,
  volumeAtom, mutedAtom, repeatAtom, nextAtom, prevAtom, appendContextAtom, pushRecentAtom, showToastAtom,
  contextAtom, upcomingAtom, likedAtom, recentAtom, skipsAtom, recordSkipAtom, navigateAtom,
} from '../store/player'
import { langAtom, tr } from '../i18n'
import type { Track } from '../types'

const store = getDefaultStore()
const el = () => engine.current()
const settings = () => store.get(settingsAtom)

let loadedId: string | null = null
let loadedQuality: string | null = null
let recovered: string | null = null
let mixing: string | null = null
let handoffSeconds: number | null = null
let preloadTimer: ReturnType<typeof setTimeout> | undefined

function playSafe() {
  engine.play().catch((e: DOMException) => {
    if (e.name !== 'AbortError') store.set(isPlayingAtom, false)
  })
}

function nextTrack(): Track | undefined {
  const up = store.get(upcomingAtom)[0]
  return up ?? (store.get(repeatAtom) === 'all' ? store.get(contextAtom).tracks[0] : undefined)
}

function profile(): Profile {
  const liked = store.get(likedAtom)
  const recent = store.get(recentAtom)
  const skips = store.get(skipsAtom)
  return {
    likedArtists: new Set(liked.map(primaryArtist)),
    knownArtists: new Set([...liked, ...recent].map(primaryArtist)),
    recentIds: new Set(recent.slice(0, 30).map((t) => t.id)),
    skippedTracks: skips.tracks,
    skippedArtists: skips.artists,
  }
}

/** ZS mix around a track: blends its radio with radios from your likes/recents, ranked by the ZS algorithm. */
export async function buildMixFor(seed: Track, limit = 30): Promise<Track[]> {
  const mode = settings().algoMode ?? 'balanced'
  const seeds = pickSeeds(seed, store.get(likedAtom), store.get(recentAtom), mode)
  const radios = await Promise.all([seed, ...seeds].map((s) => window.zsound.radio(s.id).catch(() => [] as Track[])))
  return buildMix(seed, radios, profile(), mode, limit)
}

// Keeps ZS mixes growing and, with autoplay, continues any list when it runs out.
function topUp(): Promise<number> {
  const c = store.get(contextAtom)
  const cur = store.get(currentTrackAtom)
  if (!cur || c.tracks.length - 1 - c.index >= 3) return Promise.resolve(0)
  if (!c.mixSeed && !settings().autoplay) return Promise.resolve(0)
  const key = `${c.name}:${cur.id}`
  if (mixing === key) return Promise.resolve(0)
  mixing = key
  return buildMixFor(cur)
    .then((tracks) => {
      const added = store.set(appendContextAtom, tracks)
      prefetchAhead()
      return added
    })
    .catch(() => 0)
    .finally(() => { if (mixing === key) mixing = null })
}

function prefetchAhead() {
  for (const t of store.get(upcomingAtom).slice(0, 3)) window.zsound.prefetch(t.id)
  // Load the whole next track once the current one has a head start, so skipping is instant.
  const nxt = nextTrack()
  clearTimeout(preloadTimer)
  if (nxt) preloadTimer = setTimeout(() => window.zsound.preload(nxt.id), 2500)
}

function updateMediaSession(t: Track) {
  if (!('mediaSession' in navigator)) return
  navigator.mediaSession.metadata = new MediaMetadata({
    title: t.title,
    artist: t.artist,
    album: t.album,
    artwork: t.thumbnail ? [{ src: t.thumbnail, sizes: '544x544', type: 'image/jpeg' }] : [],
  })
}

function broadcast() {
  const t = store.get(currentTrackAtom)
  const e = el()
  window.zsound.nowPlaying(t ? {
    title: t.title, artist: t.artist, thumbnail: t.thumbnail, playing: store.get(isPlayingAtom),
    duration: Number.isFinite(e.duration) ? e.duration : t.duration, position: e.currentTime,
  } : null)
}

function tintFromCover(t: Track) {
  const root = document.documentElement
  if (settings().dynamicColor === false || !t.thumbnail) return root.style.removeProperty('--dyn')
  window.zsound.coverColor(t.thumbnail).then((rgb) => {
    if (rgb && store.get(currentTrackAtom)?.id === t.id) root.style.setProperty('--dyn', rgb.join(' '))
  })
}

function loadCurrent({ startAt = 0, fresh = true } = {}) {
  const t = store.get(currentTrackAtom)
  const handoff = handoffSeconds
  handoffSeconds = null
  if (!t) {
    loadedId = null
    engine.unload()
    broadcast()
    return
  }
  const quality = settings().quality
  loadedId = t.id
  loadedQuality = quality
  store.set(streamMetaAtom, null)
  if (handoff !== null && engine.armedId() === t.id && store.get(isPlayingAtom)) {
    engine.handoff(handoff).catch(() => { engine.load(t.id, quality); playSafe() })
  } else {
    store.set(isBufferingAtom, true)
    engine.load(t.id, quality, startAt)
    if (store.get(isPlayingAtom)) playSafe()
  }
  window.zsound.streamInfo(t.id, quality).then((m) => {
    if (loadedId !== t.id) return
    store.set(streamMetaAtom, m)
    engine.setStreamMeta(t.id, m)
  })
  updateMediaSession(t)
  tintFromCover(t)
  broadcast()
  prefetchAhead()
  if (fresh) {
    recovered = null
    store.set(pushRecentAtom, t)
    void topUp()
  }
}

export function previous() {
  if (el().currentTime > 3 || !store.set(prevAtom)) el().currentTime = 0
}

export function next() {
  const cur = store.get(currentTrackAtom)
  if (cur && el().currentTime < 30) store.set(recordSkipAtom, cur)
  handoffSeconds = 0
  if (store.set(nextAtom)) return
  handoffSeconds = null
  void topUp().then((added) => { if (added) store.set(nextAtom) })
}

export function seek(seconds: number) {
  const e = el()
  if (Number.isFinite(e.duration)) e.currentTime = Math.max(0, Math.min(e.duration, seconds))
}

async function onEnded() {
  if (store.get(repeatAtom) === 'one') {
    el().currentTime = 0
    playSafe()
    return
  }
  handoffSeconds = 0
  if (store.set(nextAtom)) return
  handoffSeconds = null
  if ((await topUp()) && store.set(nextAtom)) return
  store.set(isPlayingAtom, false)
}

// Arms the next track on the idle deck ~12 s before the end, then crossfades into it.
function onTime() {
  const e = el()
  if (!Number.isFinite(e.duration) || !store.get(isPlayingAtom) || store.get(repeatAtom) === 'one') return
  const left = e.duration - e.currentTime
  const fade = Math.min(12, Math.max(0, settings().crossfade ?? 0))
  const nxt = nextTrack()
  if (!nxt || left > fade + 12) return
  if (engine.armedId() !== nxt.id) {
    const quality = settings().quality
    engine.arm(nxt.id, quality)
    window.zsound.streamInfo(nxt.id, quality).then((m) => engine.setStreamMeta(nxt.id, m))
    return
  }
  if (fade > 0 && left <= fade && handoffSeconds === null && e.duration > fade * 2) {
    handoffSeconds = fade
    if (!store.set(nextAtom)) handoffSeconds = null
  }
}

function onError() {
  if (!el().currentSrc.startsWith('zsa:') || !loadedId) return
  // First failure on a track: reload it silently where it was (fresh link, ZS Buffer refills).
  if (recovered !== loadedId) {
    recovered = loadedId
    loadCurrent({ startAt: el().currentTime, fresh: false })
    return
  }
  // Never skip or resume on our own while the user has paused.
  if (!store.get(isPlayingAtom)) return
  const t = store.get(currentTrackAtom)
  store.set(showToastAtom, tr('toast.cantPlay', { t: t?.title ?? '' }))
  store.set(isBufferingAtom, false)
  const failed = loadedId
  setTimeout(() => {
    if (!store.get(isPlayingAtom) || loadedId !== failed) return
    if (!store.set(nextAtom)) store.set(isPlayingAtom, false)
  }, 800)
}

function focusSearch() {
  store.set(navigateAtom, { kind: 'search' })
  setTimeout(() => document.querySelector<HTMLInputElement>('main input[type=text]')?.focus(), 30)
}

function onKey(e: KeyboardEvent) {
  const ctrl = e.ctrlKey || e.metaKey
  if (ctrl && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    return focusSearch()
  }
  const target = e.target as HTMLElement
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
  if (e.code === 'Space') store.set(isPlayingAtom, (p) => !p)
  else if (ctrl && e.key === 'ArrowRight') next()
  else if (ctrl && e.key === 'ArrowLeft') previous()
  else if (ctrl && e.key === 'ArrowUp') store.set(volumeAtom, (v) => Math.min(1, v + 0.05))
  else if (ctrl && e.key === 'ArrowDown') store.set(volumeAtom, (v) => Math.max(0, v - 0.05))
  else if (e.key === 'ArrowRight') seek(el().currentTime + 5)
  else if (e.key === 'ArrowLeft') seek(el().currentTime - 5)
  else if (e.key.toLowerCase() === 'm') store.set(mutedAtom, (m) => !m)
  else return
  e.preventDefault()
}

// 0.0.1/0.0.2 kept one flat queue: turn it into current track + context once.
function migrateLegacyQueue() {
  if (store.get(currentTrackAtom)) return
  try {
    const queue: Track[] = JSON.parse(window.zsound.storeGet('zs.queue') ?? localStorage.getItem('zs.queue') ?? '[]')
    const index = Number(JSON.parse(window.zsound.storeGet('zs.queueIndex') ?? localStorage.getItem('zs.queueIndex') ?? '-1'))
    if (!queue[index]) return
    store.set(contextAtom, { name: '', tracks: queue, index })
    store.set(currentTrackAtom, queue[index])
  } catch { /* nothing to migrate */ }
}

let started = false
export function startController() {
  if (started) return
  started = true
  migrateLegacyQueue()

  engine.applySettings(settings())
  engine.prepare()
  engine.setVolume(store.get(volumeAtom), store.get(mutedAtom))
  window.zsound.setLang(store.get(langAtom))
  store.sub(langAtom, () => window.zsound.setLang(store.get(langAtom)))

  store.sub(playTokenAtom, () => loadCurrent())
  store.sub(isPlayingAtom, () => {
    broadcast()
    if (!store.get(isPlayingAtom)) return engine.pause()
    if (!loadedId) loadCurrent()
    else playSafe()
  })
  store.sub(settingsAtom, () => {
    const s = settings()
    engine.applySettings(s)
    if (loadedId && s.quality !== loadedQuality) loadCurrent({ startAt: el().currentTime, fresh: false })
    const t = store.get(currentTrackAtom)
    if (t) tintFromCover(t)
  })
  const syncVolume = () => engine.setVolume(store.get(volumeAtom), store.get(mutedAtom))
  store.sub(volumeAtom, syncVolume)
  store.sub(mutedAtom, syncVolume)
  store.sub(upcomingAtom, prefetchAhead)

  engine.events.addEventListener('playing', () => { store.set(isBufferingAtom, false); broadcast() })
  engine.events.addEventListener('waiting', () => store.set(isBufferingAtom, true))
  engine.events.addEventListener('durationchange', broadcast)
  engine.events.addEventListener('timeupdate', onTime)
  engine.events.addEventListener('ended', () => void onEnded())
  engine.events.addEventListener('error', onError)

  if ('mediaSession' in navigator) {
    const ms = navigator.mediaSession
    ms.setActionHandler('play', () => store.set(isPlayingAtom, true))
    ms.setActionHandler('pause', () => store.set(isPlayingAtom, false))
    ms.setActionHandler('nexttrack', next)
    ms.setActionHandler('previoustrack', previous)
    ms.setActionHandler('seekto', (d) => { if (d.seekTime != null) seek(d.seekTime) })
  }
  window.zsound.onCommand((cmd) => {
    if (cmd === 'toggle') store.set(isPlayingAtom, (p) => !p)
    else if (cmd === 'next') next()
    else if (cmd === 'previous') previous()
  })
  window.addEventListener('keydown', onKey)

  // Restore last session paused, already buffering so play is instant.
  if (store.get(currentTrackAtom)) loadCurrent({ fresh: false })
}
