import { useAtomValue, useSetAtom } from 'jotai'
import { Heart, Ellipsis, Play, AudioLines } from 'lucide-react'
import {
  playContextAtom, currentTrackAtom, isPlayingAtom, likedIdsAtom, toggleLikeAtom, navigateAtom,
} from '../store/player'
import { Cover, formatTime, useOpenMenu } from './ui'
import { useT } from '../i18n'
import type { Track } from '../types'

interface Props {
  tracks: Track[]
  playlistId?: string
  showAlbum?: boolean
}

export default function TrackList({ tracks, playlistId, showAlbum = true }: Props) {
  const playContext = useSetAtom(playContextAtom)
  const current = useAtomValue(currentTrackAtom)
  const isPlaying = useAtomValue(isPlayingAtom)
  const likedIds = useAtomValue(likedIdsAtom)
  const toggleLike = useSetAtom(toggleLikeAtom)
  const navigate = useSetAtom(navigateAtom)
  const openMenu = useOpenMenu()
  const t = useT()
  const cols = showAlbum ? 'grid-cols-[2rem_minmax(0,5fr)_minmax(0,3fr)_2rem_3rem_2rem]' : 'grid-cols-[2rem_minmax(0,1fr)_2rem_3rem_2rem]'

  return (
    <div className="flex flex-col gap-0.5">
      {tracks.map((tr, i) => {
        const active = current?.id === tr.id
        const liked = likedIds.has(tr.id)
        return (
          <div
            key={`${tr.id}-${i}`}
            className={`track-row group grid ${cols} items-center gap-3 px-3 py-1.5 cursor-pointer ${active ? 'active' : ''}`}
            onClick={() => playContext({ tracks, index: i })}
            onMouseEnter={() => window.zsound.prefetch(tr.id)}
            onContextMenu={(e) => openMenu(e, tr, { playlistId, index: i })}
          >
            <div className="text-xs text-zs-muted text-center tabular-nums">
              {active && isPlaying
                ? <AudioLines className="w-4 h-4 mx-auto text-zs-accent-light" />
                : <><span className="group-hover:hidden">{i + 1}</span><Play className="w-3.5 h-3.5 mx-auto hidden group-hover:block text-zs-text" fill="currentColor" /></>}
            </div>
            <div className="flex items-center gap-3 min-w-0">
              <Cover src={tr.thumbnail} size={96} className="w-10 h-10" rounded="rounded-lg" />
              <div className="min-w-0">
                <div className={`text-[14px] truncate ${active ? 'text-zs-accent-light font-medium' : 'text-zs-text hl'}`}>{tr.title}</div>
                <div className="text-xs text-zs-muted truncate">{tr.artist}</div>
              </div>
            </div>
            {showAlbum && (
              <div className="text-xs text-zs-muted truncate">
                {tr.albumId
                  ? <span className="hover:text-zs-accent-light hover:underline" onClick={(e) => { e.stopPropagation(); navigate({ kind: 'collection', id: tr.albumId! }) }}>{tr.album}</span>
                  : tr.album}
              </div>
            )}
            <button
              type="button"
              title={t(liked ? 'menu.unlike' : 'menu.like')}
              aria-label={t(liked ? 'menu.unlike' : 'menu.like')}
              onClick={(e) => { e.stopPropagation(); toggleLike(tr) }}
              className={`justify-self-center transition-opacity ${liked ? 'text-zs-accent-light' : 'text-zs-muted hover:text-zs-accent-light opacity-0 group-hover:opacity-100'}`}
            >
              <Heart className="w-4 h-4" fill={liked ? 'currentColor' : 'none'} />
            </button>
            <div className="text-xs text-zs-muted tabular-nums text-right">{tr.duration ? formatTime(tr.duration) : ''}</div>
            <button
              type="button"
              title={t('menu.more')}
              aria-label={t('menu.more')}
              onClick={(e) => openMenu(e, tr, { playlistId, index: i })}
              className="justify-self-center text-zs-muted hover:text-zs-accent-light opacity-0 group-hover:opacity-100"
            >
              <Ellipsis className="w-4 h-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
