import { getDefaultStore } from 'jotai'
import * as engine from './engine'
import {
  currentTrackAtom, isPlayingAtom, isBufferingAtom, streamMetaAtom, playTokenAtom, settingsAtom,
  volumeAtom, mutedAtom, repeatAtom, queueAtom, queueIndexAtom, nextAtom, prevAtom,
  appendAutoplayAtom, pushRecentAtom, showToastAtom,
} from '../store/player'
import { langAtom, tr } from '../i18n'
import type { Track } from '../types'

const store = getDefaultStore()
const { audio } = engine

let loadedId: string | null = null
let loadedQuality: string | null = null
let autoplayFor: string | null = null

function playSafe() {
  engine.play().catch((e: DOMException) => {
    if (e.name !== 'AbortError') store.set(isPlayingAtom, false)
  })
}

function prefetchAhead() {
  const q = store.get(queueAtom)
  const i = store.get(queueIndexAtom)
  for (const t of q.slice(i + 1, i + 4)) window.zsound.prefetch(t.id)
}

function fillAutoplay(): Promise<number> {
  const cur = store.get(currentTrackAtom)
  if (!cur || !store.get(settingsAtom).autoplay || autoplayFor === cur.id) return Promise.resolve(0)
  autoplayFor = cur.id
  return window.zsound.radio(cur.id)
    .then((tracks) => {
      const added = store.set(appendAutoplayAtom, tracks.slice(0, 25))
      prefetchAhead()
      return added
    })
    .catch(() => { autoplayFor = null; return 0 })
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

function loadCurrent({ startAt = 0, fresh = true } = {}) {
  const t = store.get(currentTrackAtom)
  if (!t) {
    loadedId = null
    engine.unload()
    return
  }
  const quality = store.get(settingsAtom).quality
  loadedId = t.id
  loadedQuality = quality
  store.set(isBufferingAtom, true)
  store.set(streamMetaAtom, null)
  engine.load(t.id, quality, startAt)
  if (store.get(isPlayingAtom)) playSafe()
  window.zsound.streamInfo(t.id, quality).then((m) => {
    if (loadedId !== t.id) return
    store.set(streamMetaAtom, m)
    engine.setStreamMeta(m)
  })
  updateMediaSession(t)
  prefetchAhead()
  if (fresh) {
    store.set(pushRecentAtom, t)
    if (store.get(queueIndexAtom) >= store.get(queueAtom).length - 2) void fillAutoplay()
  }
}

export function previous() {
  if (audio.currentTime > 3 || !store.set(prevAtom)) audio.currentTime = 0
}

export function next() {
  if (store.set(nextAtom)) return
  void fillAutoplay().then((added) => { if (added) store.set(nextAtom) })
}

export function seek(seconds: number) {
  if (Number.isFinite(audio.duration)) audio.currentTime = Math.max(0, Math.min(audio.duration, seconds))
}

async function onEnded() {
  if (store.get(repeatAtom) === 'one') {
    audio.currentTime = 0
    playSafe()
    return
  }
  if (store.set(nextAtom)) return
  if ((await fillAutoplay()) && store.set(nextAtom)) return
  store.set(isPlayingAtom, false)
}

function onError() {
  if (!audio.currentSrc.startsWith('zsa:') || !loadedId) return
  const t = store.get(currentTrackAtom)
  store.set(showToastAtom, tr('toast.cantPlay', { t: t?.title ?? '' }))
  store.set(isBufferingAtom, false)
  setTimeout(() => { if (!store.set(nextAtom)) store.set(isPlayingAtom, false) }, 800)
}

function onKey(e: KeyboardEvent) {
  const el = e.target as HTMLElement
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable) return
  const ctrl = e.ctrlKey || e.metaKey
  if (e.code === 'Space') store.set(isPlayingAtom, (p) => !p)
  else if (ctrl && e.key === 'ArrowRight') next()
  else if (ctrl && e.key === 'ArrowLeft') previous()
  else if (ctrl && e.key === 'ArrowUp') store.set(volumeAtom, (v) => Math.min(1, v + 0.05))
  else if (ctrl && e.key === 'ArrowDown') store.set(volumeAtom, (v) => Math.max(0, v - 0.05))
  else if (e.key === 'ArrowRight') seek(audio.currentTime + 5)
  else if (e.key === 'ArrowLeft') seek(audio.currentTime - 5)
  else if (e.key.toLowerCase() === 'm') store.set(mutedAtom, (m) => !m)
  else return
  e.preventDefault()
}

let started = false
export function startController() {
  if (started) return
  started = true

  engine.applySettings(store.get(settingsAtom))
  engine.setVolume(store.get(volumeAtom), store.get(mutedAtom))
  window.zsound.setLang(store.get(langAtom))
  store.sub(langAtom, () => window.zsound.setLang(store.get(langAtom)))

  store.sub(playTokenAtom, () => loadCurrent())
  store.sub(isPlayingAtom, () => {
    if (!store.get(isPlayingAtom)) return audio.pause()
    if (!loadedId) loadCurrent()
    else playSafe()
  })
  store.sub(settingsAtom, () => {
    const s = store.get(settingsAtom)
    engine.applySettings(s)
    if (loadedId && s.quality !== loadedQuality) loadCurrent({ startAt: audio.currentTime, fresh: false })
  })
  const syncVolume = () => engine.setVolume(store.get(volumeAtom), store.get(mutedAtom))
  store.sub(volumeAtom, syncVolume)
  store.sub(mutedAtom, syncVolume)

  audio.addEventListener('playing', () => store.set(isBufferingAtom, false))
  audio.addEventListener('waiting', () => store.set(isBufferingAtom, true))
  audio.addEventListener('ended', () => void onEnded())
  audio.addEventListener('error', onError)

  if ('mediaSession' in navigator) {
    const ms = navigator.mediaSession
    ms.setActionHandler('play', () => store.set(isPlayingAtom, true))
    ms.setActionHandler('pause', () => store.set(isPlayingAtom, false))
    ms.setActionHandler('nexttrack', next)
    ms.setActionHandler('previoustrack', previous)
    ms.setActionHandler('seekto', (d) => { if (d.seekTime != null) seek(d.seekTime) })
  }
  window.addEventListener('keydown', onKey)

  // Restore last session paused, already buffering so play is instant.
  if (store.get(currentTrackAtom)) loadCurrent({ fresh: false })
}
