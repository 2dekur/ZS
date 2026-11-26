import { useEffect, useState } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { Play, Shuffle, Heart, Trash, LibraryBig } from 'lucide-react'
import {
  playContextAtom, shuffleAtom, likedAtom, playlistsAtom, renamePlaylistAtom, deletePlaylistAtom,
  createPlaylistAtom, backAtom, showToastAtom,
} from '../store/player'
import TrackList from './TrackList'
import { Cover, IconBtn, Skeleton, formatTime } from './ui'
import { useT } from '../i18n'
import type { CollectionPage, Track } from '../types'

function Header({ cover, kind, title, subtitle, tracks, children }: {
  cover: React.ReactNode
  kind: string
  title: React.ReactNode
  subtitle: string
  tracks: Track[]
  children?: React.ReactNode
}) {
  const playContext = useSetAtom(playContextAtom)
  const setShuffle = useSetAtom(shuffleAtom)
  const t = useT()
  const total = tracks.reduce((s, tr) => s + tr.duration, 0)
  return (
    <>
      <div className="flex items-end gap-6 mb-6">
        {cover}
        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-zs-muted uppercase tracking-widest">{kind}</div>
          <div className="text-5xl font-semibold text-zs-text my-2 truncate">{title}</div>
          <div className="text-sm text-zs-muted">
            {subtitle}{subtitle ? ' · ' : ''}{t('col.songs', { n: tracks.length })}{total ? `, ${formatTime(total)}` : ''}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-4 mb-4">
        <button
          type="button"
          aria-label={t('col.play')}
          title={t('col.play')}
          disabled={!tracks.length}
          onClick={() => { setShuffle(false); playContext({ tracks, index: 0 }) }}
          className="btn-primary w-14 h-14 disabled:opacity-30"
        >
          <Play className="w-6 h-6 ml-0.5" fill="currentColor" />
        </button>
        <IconBtn
          title={t('col.shuffle')}
          disabled={!tracks.length}
          onClick={() => { setShuffle(true); playContext({ tracks, index: Math.floor(Math.random() * tracks.length) }) }}
          className="w-10 h-10"
        >
          <Shuffle className="w-6 h-6" />
        </IconBtn>
        {children}
      </div>
    </>
  )
}

const pageCache = new Map<string, CollectionPage>()

export function CollectionView({ id }: { id: string }) {
  const [page, setPage] = useState<CollectionPage | undefined>(pageCache.get(id))
  const [failed, setFailed] = useState(false)
  const createPlaylist = useSetAtom(createPlaylistAtom)
  const toast = useSetAtom(showToastAtom)
  const t = useT()

  useEffect(() => {
    setFailed(false)
    const hit = pageCache.get(id)
    setPage(hit)
    if (hit) return
    let live = true
    window.zsound.collection(id)
      .then((p) => { pageCache.set(id, p); if (live) setPage(p) })
      .catch(() => { if (live) setFailed(true) })
    return () => { live = false }
  }, [id])

  if (failed) return <p className="p-6 text-sm text-zs-muted">{t('col.loadFail')}</p>
  if (!page) {
    return (
      <div className="p-6 space-y-4">
        <div className="flex items-end gap-6"><Skeleton className="w-48 h-48" /><Skeleton className="h-12 w-80" /></div>
        {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    )
  }
  const isAlbum = id.startsWith('MPRE')
  return (
    <div className="p-6 view-in">
      <Header cover={<Cover src={page.thumbnail} size={544} className="w-48 h-48 shadow-2xl" rounded="rounded-2xl" />} kind={t(isAlbum ? 'col.album' : 'col.playlist')} title={page.title} subtitle={page.subtitle} tracks={page.tracks}>
        <IconBtn
          title={t('col.save')}
          onClick={() => { createPlaylist({ name: page.title, tracks: page.tracks }); toast(t('col.saved', { t: page.title })) }}
          className="w-10 h-10"
        >
          <LibraryBig className="w-6 h-6" />
        </IconBtn>
      </Header>
      <TrackList tracks={page.tracks} showAlbum={!isAlbum} />
    </div>
  )
}

export function LikedView() {
  const liked = useAtomValue(likedAtom)
  const t = useT()
  return (
    <div className="p-6 view-in">
      <Header
        cover={
          <div className="w-48 h-48 rounded-2xl flex items-center justify-center shadow-2xl flex-shrink-0 border border-white/10" style={{ background: 'linear-gradient(135deg, #1c3fb8, #2a5bf0 55%, #0d1d55)' }}>
            <Heart className="w-16 h-16 text-white" fill="currentColor" />
          </div>
        }
        kind={t('col.playlist')}
        title={t('lib.liked')}
        subtitle=""
        tracks={liked}
      />
      {liked.length ? <TrackList tracks={liked} /> : <p className="text-sm text-zs-muted">{t('col.emptyLiked')}</p>}
    </div>
  )
}

export function PlaylistView({ id }: { id: string }) {
  const playlist = useAtomValue(playlistsAtom).find((p) => p.id === id)
  const rename = useSetAtom(renamePlaylistAtom)
  const remove = useSetAtom(deletePlaylistAtom)
  const back = useSetAtom(backAtom)
  const [editing, setEditing] = useState(false)
  const t = useT()

  if (!playlist) return <p className="p-6 text-sm text-zs-muted">{t('col.deleted')}</p>

  const title = editing ? (
    <input
      autoFocus
      defaultValue={playlist.name}
      onBlur={(e) => { rename({ id, name: e.target.value }); setEditing(false) }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') setEditing(false)
      }}
      className="bg-white/10 rounded-xl px-2 outline-none w-full text-5xl font-semibold"
    />
  ) : (
    <span title={t('col.rename')} className="cursor-text" onClick={() => setEditing(true)}>{playlist.name}</span>
  )

  return (
    <div className="p-6 view-in">
      <Header cover={<Cover src={playlist.tracks[0]?.thumbnail} size={544} className="w-48 h-48 shadow-2xl" rounded="rounded-2xl" />} kind={t('col.playlist')} title={title} subtitle="" tracks={playlist.tracks}>
        <IconBtn
          title={t('col.delete')}
          onClick={() => { if (window.confirm(t('col.confirmDelete', { t: playlist.name }))) { remove(id); back() } }}
          className="w-10 h-10"
        >
          <Trash className="w-5 h-5" />
        </IconBtn>
      </Header>
      {playlist.tracks.length
        ? <TrackList tracks={playlist.tracks} playlistId={id} />
        : <p className="text-sm text-zs-muted">{t('col.emptyPlaylist')}</p>}
    </div>
  )
}
