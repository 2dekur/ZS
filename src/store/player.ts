import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import type { Track, Playlist, Settings, RepeatMode, StreamMeta, View, Shelf, UpdateState } from '../types'
import { tr } from '../i18n'

const persist = <T,>(key: string, init: T) => atomWithStorage<T>(`zs.${key}`, init, undefined, { getOnInit: true })

export const EQ_BANDS = [60, 230, 910, 3600, 14000]
export const EQ_PRESETS = {
  flat: [0, 0, 0, 0, 0],
  bass: [7, 4, 0, 0, 0],
  vocal: [-2, 0, 3, 4, 1],
  treble: [0, 0, 0, 3, 6],
  loudness: [5, 2, -1, 2, 5],
  electronic: [5, 3, -1, 2, 4],
}
export const DEFAULT_SETTINGS: Settings = { quality: 'zs', normalize: true, eqEnabled: false, eq: [0, 0, 0, 0, 0], autoplay: true }

// --- persisted ---
export const volumeAtom = persist('volume', 0.8)
export const mutedAtom = persist('muted', false)
export const settingsAtom = persist<Settings>('settings', DEFAULT_SETTINGS)
export const likedAtom = persist<Track[]>('liked', [])
export const playlistsAtom = persist<Playlist[]>('playlists', [])
export const recentAtom = persist<Track[]>('recent', [])
export const queueAtom = persist<Track[]>('queue', [])
export const queueIndexAtom = persist('queueIndex', -1)
export const originalQueueAtom = persist<Track[] | null>('originalQueue', null)
export const shuffleAtom = persist('shuffle', false)
export const repeatAtom = persist<RepeatMode>('repeat', 'off')
export const panelAtom = persist<'none' | 'queue' | 'lyrics'>('panel', 'none')
export const homeCacheAtom = persist<{ key: string; at: number; shelves: Shelf[] } | null>('homeCache', null)
export const dismissedUpdateAtom = persist<string | null>('dismissedUpdate', null)

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

export const currentTrackAtom = atom((get) => get(queueAtom)[get(queueIndexAtom)] ?? null)
export const likedIdsAtom = atom((get) => new Set(get(likedAtom).map((t) => t.id)))

export const showToastAtom = atom(null, (_get, set, msg: string) => set(toastAtom, { msg, id: Date.now() }))

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// --- queue ---
export const playContextAtom = atom(null, (get, set, { tracks, index }: { tracks: Track[]; index: number }) => {
  if (!tracks[index]) return
  if (get(shuffleAtom)) {
    set(queueAtom, [tracks[index], ...shuffled(tracks.filter((_, i) => i !== index))])
    set(queueIndexAtom, 0)
    set(originalQueueAtom, tracks)
  } else {
    set(queueAtom, tracks)
    set(queueIndexAtom, index)
    set(originalQueueAtom, null)
  }
  set(playTokenAtom, (n) => n + 1)
  set(isPlayingAtom, true)
})

export const jumpToAtom = atom(null, (get, set, pos: number) => {
  if (!get(queueAtom)[pos]) return
  set(queueIndexAtom, pos)
  set(playTokenAtom, (n) => n + 1)
  set(isPlayingAtom, true)
})

export const nextAtom = atom(null, (get, set): boolean => {
  const q = get(queueAtom)
  const i = get(queueIndexAtom)
  if (i < q.length - 1) set(queueIndexAtom, i + 1)
  else if (get(repeatAtom) === 'all' && q.length) set(queueIndexAtom, 0)
  else return false
  set(playTokenAtom, (n) => n + 1)
  set(isPlayingAtom, true)
  return true
})

export const prevAtom = atom(null, (get, set): boolean => {
  const q = get(queueAtom)
  const i = get(queueIndexAtom)
  if (i > 0) set(queueIndexAtom, i - 1)
  else if (get(repeatAtom) === 'all' && q.length) set(queueIndexAtom, q.length - 1)
  else return false
  set(playTokenAtom, (n) => n + 1)
  set(isPlayingAtom, true)
  return true
})

function insertIntoOriginal(get: any, set: any, track: Track, atEnd: boolean) {
  const orig: Track[] | null = get(originalQueueAtom)
  if (!orig) return
  const cur = get(currentTrackAtom)
  const at = atEnd ? orig.length : orig.findIndex((t) => t.id === cur?.id) + 1
  set(originalQueueAtom, [...orig.slice(0, at), track, ...orig.slice(at)])
}

export const playNextAtom = atom(null, (get, set, track: Track) => {
  const q = get(queueAtom)
  if (!q.length) return set(playContextAtom, { tracks: [track], index: 0 })
  const i = get(queueIndexAtom)
  set(queueAtom, [...q.slice(0, i + 1), track, ...q.slice(i + 1)])
  insertIntoOriginal(get, set, track, false)
  window.zsound.prefetch(track.id)
  set(showToastAtom, tr('toast.playingNext', { t: track.title }))
})

export const addToQueueAtom = atom(null, (get, set, track: Track) => {
  const q = get(queueAtom)
  if (!q.length) return set(playContextAtom, { tracks: [track], index: 0 })
  set(queueAtom, [...q, track])
  insertIntoOriginal(get, set, track, true)
  set(showToastAtom, tr('toast.addedQueue', { t: track.title }))
})

export const appendAutoplayAtom = atom(null, (get, set, tracks: Track[]) => {
  const seen = new Set(get(queueAtom).map((t) => t.id))
  const fresh = tracks.filter((t) => !seen.has(t.id))
  if (fresh.length) set(queueAtom, [...get(queueAtom), ...fresh])
  return fresh.length
})

export const removeFromQueueAtom = atom(null, (get, set, pos: number) => {
  const i = get(queueIndexAtom)
  if (pos === i) return
  const q = [...get(queueAtom)]
  q.splice(pos, 1)
  set(queueAtom, q)
  if (pos < i) set(queueIndexAtom, i - 1)
})

export const clearUpcomingAtom = atom(null, (get, set) => {
  set(queueAtom, get(queueAtom).slice(0, get(queueIndexAtom) + 1))
  set(originalQueueAtom, null)
})

export const toggleShuffleAtom = atom(null, (get, set) => {
  const on = !get(shuffleAtom)
  set(shuffleAtom, on)
  const q = get(queueAtom)
  const i = get(queueIndexAtom)
  if (!q.length) return
  if (on) {
    set(originalQueueAtom, q)
    set(queueAtom, [...q.slice(0, i + 1), ...shuffled(q.slice(i + 1))])
    return
  }
  const orig = get(originalQueueAtom)
  const j = orig?.findIndex((t) => t.id === q[i]?.id) ?? -1
  if (orig && j >= 0) {
    set(queueAtom, orig)
    set(queueIndexAtom, j)
  }
  set(originalQueueAtom, null)
})

export const cycleRepeatAtom = atom(null, (get, set) => {
  const order: RepeatMode[] = ['off', 'all', 'one']
  set(repeatAtom, order[(order.indexOf(get(repeatAtom)) + 1) % 3])
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
const historyAtom = atom<View[]>([])
export const canGoBackAtom = atom((get) => get(historyAtom).length > 0)

export const navigateAtom = atom(null, (get, set, view: View) => {
  const cur = get(viewAtom)
  if (JSON.stringify(cur) === JSON.stringify(view)) return
  set(historyAtom, [...get(historyAtom), cur].slice(-50))
  set(viewAtom, view)
})

export const backAtom = atom(null, (get, set) => {
  const h = get(historyAtom)
  if (!h.length) return
  set(viewAtom, h[h.length - 1])
  set(historyAtom, h.slice(0, -1))
})
