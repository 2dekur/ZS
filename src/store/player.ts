import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import type { Track, Playlist, Settings, RepeatMode, StreamMeta, View, Shelf, UpdateState } from '../types'
import { tr } from '../i18n'
import { fileStorage } from './storage'
import { primaryArtist } from '../audio/algo'

const persist = <T,>(key: string, init: T) => atomWithStorage<T>(`zs.${key}`, init, fileStorage, { getOnInit: true })

export const EQ_BANDS = [60, 230, 910, 3600, 14000]
export const EQ_PRESETS = {
  flat: [0, 0, 0, 0, 0],
  bass: [7, 4, 0, 0, 0],
  vocal: [-2, 0, 3, 4, 1],
  treble: [0, 0, 0, 3, 6],
  loudness: [5, 2, -1, 2, 5],
  electronic: [5, 3, -1, 2, 4],
}
export const DEFAULT_SETTINGS: Settings = {
  quality: 'zs', normalize: true, eqEnabled: false, eq: [0, 0, 0, 0, 0], autoplay: true, zsLoudness: true,
  algoMode: 'balanced', crossfade: 0, closeToTray: true, dynamicColor: true, discord: false,
}

export interface PlayContext {
  name: string
  tracks: Track[]
  index: number
  /** Set when the context is a ZS mix built around this track: it keeps growing as it plays. */
  mixSeed?: string
}

// --- persisted ---
export const volumeAtom = persist('volume', 0.8)
export const mutedAtom = persist('muted', false)
export const settingsAtom = persist<Settings>('settings', DEFAULT_SETTINGS)
export const likedAtom = persist<Track[]>('liked', [])
export const playlistsAtom = persist<Playlist[]>('playlists', [])
export const recentAtom = persist<Track[]>('recent', [])
export const currentTrackAtom = persist<Track | null>('current', null)
export const fromQueueAtom = persist('fromQueue', false)
export const contextAtom = persist<PlayContext>('context', { name: '', tracks: [], index: -1 })
export const userQueueAtom = persist<Track[]>('userQueue', [])
export const originalContextAtom = persist<Track[] | null>('originalContext', null)
export const shuffleAtom = persist('shuffle', false)
export const repeatAtom = persist<RepeatMode>('repeat', 'off')
export const panelAtom = persist<'none' | 'queue' | 'lyrics'>('panel', 'none')
export const homeCacheAtom = persist<{ key: string; at: number; shelves: Shelf[] } | null>('homeCache', null)
export const dismissedUpdateAtom = persist<string | null>('dismissedUpdate', null)
export const skipsAtom = persist<{ tracks: Record<string, number>; artists: Record<string, number> }>('skips', { tracks: {}, artists: {} })

// --- app ---
export interface AppInfo { version: string; packaged: boolean; hardwareAcceleration: boolean; hardwareAccelerationPref: boolean }
export const appInfoAtom = atom<AppInfo | null>(null)
export const updateStateAtom = atom<UpdateState>({ status: 'idle' })

// --- session ---
export const isPlayingAtom = atom(false)
export const isBufferingAtom = atom(false)
export const streamMetaAtom = atom<StreamMeta | null>(null)
export const playTokenAtom = atom(0)
export const searchQueryAtom = atom('')
export const searchResultsAtom = atom<Track[]>([])
export const isSearchingAtom = atom(false)
export const contextMenuAtom = atom<{ x: number; y: number; track: Track; playlistId?: string; index?: number } | null>(null)
export const toastAtom = atom<{ msg: string; id: number } | null>(null)
const playedAtom = atom<{ track: Track; fromQueue: boolean }[]>([])

export const likedIdsAtom = atom((get) => new Set(get(likedAtom).map((t) => t.id)))
/** What plays next, in order: your own queue first, then the rest of the context. */
export const upcomingAtom = atom((get) => {
  const c = get(contextAtom)
  return [...get(userQueueAtom), ...c.tracks.slice(c.index + 1)]
})

export const showToastAtom = atom(null, (_get, set, msg: string) => set(toastAtom, { msg, id: Date.now() }))

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

type Getter = <V>(a: import('jotai').Atom<V>) => V
type Setter = (a: any, ...args: any[]) => any

function setCurrent(get: Getter, set: Setter, track: Track, fromQueue: boolean, remember = true) {
  const prev = get(currentTrackAtom)
  if (prev && remember) set(playedAtom, [...get(playedAtom), { track: prev, fromQueue: get(fromQueueAtom) }].slice(-100))
  set(currentTrackAtom, track)
  set(fromQueueAtom, fromQueue)
  set(playTokenAtom, (n: number) => n + 1)
  set(isPlayingAtom, true)
}

// --- playback ---
/** Plays a list in order (album, playlist, liked songs). Your own queue is kept. */
export const playContextAtom = atom(null, (get, set, { tracks, index, name }: { tracks: Track[]; index: number; name: string }) => {
  if (!tracks[index]) return
  if (get(shuffleAtom)) {
    set(contextAtom, { name, tracks: [tracks[index], ...shuffled(tracks.filter((_, i) => i !== index))], index: 0 })
    set(originalContextAtom, tracks)
  } else {
    set(contextAtom, { name, tracks, index })
    set(originalContextAtom, null)
  }
  setCurrent(get, set, tracks[index], false)
})

/** Plays one track and builds a ZS mix after it (search results, single cards, radio). */
export const playMixAtom = atom(null, (get, set, track: Track) => {
  set(contextAtom, { name: tr('ctx.mix', { t: track.title }), tracks: [track], index: 0, mixSeed: track.id })
  set(originalContextAtom, null)
  setCurrent(get, set, track, false)
})

export const appendContextAtom = atom(null, (get, set, tracks: Track[]) => {
  const c = get(contextAtom)
  const seen = new Set([...c.tracks, ...get(userQueueAtom)].map((t) => t.id))
  const cur = get(currentTrackAtom)
  if (cur) seen.add(cur.id)
  const fresh = tracks.filter((t) => !seen.has(t.id))
  if (fresh.length) set(contextAtom, { ...c, tracks: [...c.tracks, ...fresh] })
  return fresh.length
})

export const nextAtom = atom(null, (get, set): boolean => {
  const q = get(userQueueAtom)
  if (q.length) {
    set(userQueueAtom, q.slice(1))
    setCurrent(get, set, q[0], true)
    return true
  }
  const c = get(contextAtom)
  let i = c.index + 1
  if (i >= c.tracks.length) {
    if (get(repeatAtom) !== 'all' || !c.tracks.length) return false
    i = 0
  }
  set(contextAtom, { ...c, index: i })
  setCurrent(get, set, c.tracks[i], false)
  return true
})

export const prevAtom = atom(null, (get, set): boolean => {
  const played = get(playedAtom)
  const last = played[played.length - 1]
  if (!last) return false
  set(playedAtom, played.slice(0, -1))
  const cur = get(currentTrackAtom)
  // A queued track you step back from goes back to the front of your queue.
  if (cur && get(fromQueueAtom)) set(userQueueAtom, [cur, ...get(userQueueAtom)])
  if (!last.fromQueue) {
    const c = get(contextAtom)
    const i = c.tracks.findIndex((t) => t.id === last.track.id)
    if (i >= 0) set(contextAtom, { ...c, index: i })
  }
  setCurrent(get, set, last.track, last.fromQueue, false)
  return true
})

export const playNextAtom = atom(null, (get, set, track: Track) => {
  if (!get(currentTrackAtom)) return set(playMixAtom, track)
  set(userQueueAtom, [track, ...get(userQueueAtom)])
  window.zsound.prefetch(track.id)
  set(showToastAtom, tr('toast.playingNext', { t: track.title }))
})

export const addToQueueAtom = atom(null, (get, set, track: Track) => {
  if (!get(currentTrackAtom)) return set(playMixAtom, track)
  set(userQueueAtom, [...get(userQueueAtom), track])
  window.zsound.prefetch(track.id)
  set(showToastAtom, tr('toast.addedQueue', { t: track.title }))
})

export const jumpQueueAtom = atom(null, (get, set, i: number) => {
  const q = get(userQueueAtom)
  if (!q[i]) return
  set(userQueueAtom, q.slice(i + 1))
  setCurrent(get, set, q[i], true)
})

export const jumpContextAtom = atom(null, (get, set, pos: number) => {
  const c = get(contextAtom)
  if (!c.tracks[pos]) return
  set(contextAtom, { ...c, index: pos })
  setCurrent(get, set, c.tracks[pos], false)
})

export const removeQueuedAtom = atom(null, (get, set, i: number) => {
  set(userQueueAtom, get(userQueueAtom).filter((_, j) => j !== i))
})

export const removeUpcomingAtom = atom(null, (get, set, pos: number) => {
  const c = get(contextAtom)
  if (pos <= c.index) return
  set(contextAtom, { ...c, tracks: c.tracks.filter((_, j) => j !== pos) })
})

export const clearQueueAtom = atom(null, (_get, set) => set(userQueueAtom, []))

export const clearUpcomingAtom = atom(null, (get, set) => {
  const c = get(contextAtom)
  set(contextAtom, { ...c, tracks: c.tracks.slice(0, c.index + 1), mixSeed: undefined })
  set(originalContextAtom, null)
})

export const toggleShuffleAtom = atom(null, (get, set) => {
  const on = !get(shuffleAtom)
  set(shuffleAtom, on)
  const c = get(contextAtom)
  if (!c.tracks.length) return
  if (on) {
    set(originalContextAtom, c.tracks)
    set(contextAtom, { ...c, tracks: [...c.tracks.slice(0, c.index + 1), ...shuffled(c.tracks.slice(c.index + 1))] })
    return
  }
  const orig = get(originalContextAtom)
  const cur = c.tracks[c.index]
  const j = orig?.findIndex((t) => t.id === cur?.id) ?? -1
  if (orig && j >= 0) set(contextAtom, { ...c, tracks: orig, index: j })
  set(originalContextAtom, null)
})

export const cycleRepeatAtom = atom(null, (get, set) => {
  const order: RepeatMode[] = ['off', 'all', 'one']
  set(repeatAtom, order[(order.indexOf(get(repeatAtom)) + 1) % 3])
})

/** A track skipped in its first 30 s counts against it (and a little against its artist) in the ZS mix. */
export const recordSkipAtom = atom(null, (get, set, track: Track) => {
  const s = get(skipsAtom)
  const artist = primaryArtist(track)
  const trim = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).slice(-500))
  set(skipsAtom, {
    tracks: trim({ ...s.tracks, [track.id]: (s.tracks[track.id] ?? 0) + 1 }),
    artists: trim({ ...s.artists, [artist]: (s.artists[artist] ?? 0) + 1 }),
  })
})

// --- library ---
export const toggleLikeAtom = atom(null, (get, set, track: Track) => {
  const liked = get(likedAtom)
  const has = liked.some((t) => t.id === track.id)
  set(likedAtom, has ? liked.filter((t) => t.id !== track.id) : [track, ...liked])
  set(showToastAtom, tr(has ? 'toast.unliked' : 'toast.liked'))
})

export const pushRecentAtom = atom(null, (get, set, track: Track) => {
  set(recentAtom, [track, ...get(recentAtom).filter((t) => t.id !== track.id)].slice(0, 50))
})

export const createPlaylistAtom = atom(null, (get, set, { name, tracks = [] }: { name: string; tracks?: Track[] }) => {
  const id = `pl_${Date.now().toString(36)}`
  set(playlistsAtom, [...get(playlistsAtom), { id, name: name.trim() || tr('lib.newPlaylist'), tracks, createdAt: Date.now() }])
  return id
})

export const addToPlaylistAtom = atom(null, (get, set, { id, track }: { id: string; track: Track }) => {
  const pl = get(playlistsAtom).find((p) => p.id === id)
  if (!pl) return
  if (pl.tracks.some((t) => t.id === track.id)) return set(showToastAtom, tr('toast.already', { p: pl.name }))
  set(playlistsAtom, get(playlistsAtom).map((p) => (p.id === id ? { ...p, tracks: [...p.tracks, track] } : p)))
  set(showToastAtom, tr('toast.addedPlaylist', { p: pl.name }))
})

export const removeFromPlaylistAtom = atom(null, (get, set, { id, index }: { id: string; index: number }) => {
  set(playlistsAtom, get(playlistsAtom).map((p) => (p.id === id ? { ...p, tracks: p.tracks.filter((_, i) => i !== index) } : p)))
})

export const renamePlaylistAtom = atom(null, (get, set, { id, name }: { id: string; name: string }) => {
  if (!name.trim()) return
  set(playlistsAtom, get(playlistsAtom).map((p) => (p.id === id ? { ...p, name: name.trim() } : p)))
})

export const deletePlaylistAtom = atom(null, (get, set, id: string) => {
  set(playlistsAtom, get(playlistsAtom).filter((p) => p.id !== id))
})

// --- navigation ---
export const viewAtom = atom<View>({ kind: 'home' })
const navHistoryAtom = atom<View[]>([])
export const canGoBackAtom = atom((get) => get(navHistoryAtom).length > 0)

export const navigateAtom = atom(null, (get, set, view: View) => {
  const cur = get(viewAtom)
  if (JSON.stringify(cur) === JSON.stringify(view)) return
  set(navHistoryAtom, [...get(navHistoryAtom), cur].slice(-50))
  set(viewAtom, view)
})

export const backAtom = atom(null, (get, set) => {
  const h = get(navHistoryAtom)
  if (!h.length) return
  set(viewAtom, h[h.length - 1])
  set(navHistoryAtom, h.slice(0, -1))
})
