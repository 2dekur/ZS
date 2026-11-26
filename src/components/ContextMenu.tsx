import { useEffect, useRef, useState, useLayoutEffect } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { ListStart, ListEnd, Radio, Heart, ListPlus, Disc3, Trash, Plus, ChevronLeft } from 'lucide-react'
import {
  contextMenuAtom, playNextAtom, addToQueueAtom, likedIdsAtom, toggleLikeAtom, playlistsAtom,
  addToPlaylistAtom, createPlaylistAtom, removeFromPlaylistAtom, navigateAtom, playContextAtom, showToastAtom,
} from '../store/player'
import { useT } from '../i18n'

function Item({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-zs-text rounded-lg hover:bg-white/[0.07] text-left">
      <span className="w-4 h-4 text-zs-muted flex items-center">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  )
}

export default function ContextMenu() {
  const [menu, setMenu] = useAtom(contextMenuAtom)
  const [pickPlaylist, setPickPlaylist] = useState(false)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const ref = useRef<HTMLDivElement>(null)
  const likedIds = useAtomValue(likedIdsAtom)
  const playlists = useAtomValue(playlistsAtom)
  const playNext = useSetAtom(playNextAtom)
  const addToQueue = useSetAtom(addToQueueAtom)
  const toggleLike = useSetAtom(toggleLikeAtom)
  const addToPlaylist = useSetAtom(addToPlaylistAtom)
  const createPlaylist = useSetAtom(createPlaylistAtom)
  const removeFromPlaylist = useSetAtom(removeFromPlaylistAtom)
  const navigate = useSetAtom(navigateAtom)
  const playContext = useSetAtom(playContextAtom)
  const toast = useSetAtom(showToastAtom)
  const t = useT()

  useEffect(() => {
    if (!menu) return
    setPickPlaylist(false)
    const close = (e: Event) => {
      if (e instanceof MouseEvent && ref.current?.contains(e.target as Node)) return
      setMenu(null)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null) }
    window.addEventListener('mousedown', close)
    window.addEventListener('wheel', close, { passive: true })
    window.addEventListener('blur', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('wheel', close)
      window.removeEventListener('blur', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu, setMenu])

  useLayoutEffect(() => {
    if (!menu || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    setPos({
      x: Math.min(menu.x, window.innerWidth - r.width - 8),
      y: Math.min(menu.y, window.innerHeight - r.height - 8),
    })
  }, [menu, pickPlaylist])

  if (!menu) return null
  const { track, playlistId, index } = menu
  const done = (fn: () => void) => () => { fn(); setMenu(null) }
  const liked = likedIds.has(track.id)

  return (
    <div
      ref={ref}
      role="menu"
      className="ctx-menu fixed z-50 w-64 p-1.5 rounded-2xl fade-in"
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {pickPlaylist ? (
        <>
          <Item icon={<ChevronLeft className="w-4 h-4" />} label={t('menu.back')} onClick={() => setPickPlaylist(false)} />
          <div className="h-px bg-white/10 my-1" />
          <Item icon={<Plus className="w-4 h-4" />} label={t('lib.newPlaylist')} onClick={done(() => {
            createPlaylist({ name: t('lib.myPlaylist', { n: playlists.length + 1 }), tracks: [track] })
            toast(t('toast.playlistCreated'))
          })} />
          <div className="max-h-60 overflow-y-auto scrollbar-thin">
            {playlists.map((p) => (
              <Item key={p.id} icon={<ListPlus className="w-4 h-4" />} label={p.name} onClick={done(() => addToPlaylist({ id: p.id, track }))} />
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="px-3 pt-1.5 pb-2 text-xs text-zs-muted truncate">{track.title} · {track.artist}</div>
          <Item icon={<ListStart className="w-4 h-4" />} label={t('menu.playNext')} onClick={done(() => playNext(track))} />
          <Item icon={<ListEnd className="w-4 h-4" />} label={t('menu.addQueue')} onClick={done(() => addToQueue(track))} />
          <Item icon={<Radio className="w-4 h-4" />} label={t('menu.radio')} onClick={done(() => {
            toast(t('toast.radio', { t: track.title }))
            window.zsound.radio(track.id)
              .then((r) => playContext({ tracks: [track, ...r], index: 0 }))
              .catch(() => toast(t('toast.radioFail')))
          })} />
          <div className="h-px bg-white/10 my-1" />
          <Item icon={<Heart className="w-4 h-4" fill={liked ? 'currentColor' : 'none'} />} label={t(liked ? 'menu.unlike' : 'menu.like')} onClick={done(() => toggleLike(track))} />
          <Item icon={<ListPlus className="w-4 h-4" />} label={t('menu.addPlaylist')} onClick={() => setPickPlaylist(true)} />
          {playlistId && index != null && (
            <Item icon={<Trash className="w-4 h-4" />} label={t('menu.removePlaylist')} onClick={done(() => removeFromPlaylist({ id: playlistId, index }))} />
          )}
          {track.albumId && (
            <Item icon={<Disc3 className="w-4 h-4" />} label={t('menu.album')} onClick={done(() => navigate({ kind: 'collection', id: track.albumId! }))} />
          )}
        </>
      )}
    </div>
  )
}
