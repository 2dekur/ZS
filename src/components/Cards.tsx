import { Play } from 'lucide-react'
import { Cover, useOpenMenu } from './ui'
import { useT } from '../i18n'
import type { Track, Collection } from '../types'

function PlayFab({ onClick }: { onClick: (e: React.MouseEvent) => void }) {
  const t = useT()
  return (
    <button
      type="button"
      aria-label={t('player.play')}
      onClick={onClick}
      className="btn-primary absolute right-2 bottom-2 w-10 h-10 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all"
    >
      <Play className="w-4 h-4 ml-0.5" fill="currentColor" />
    </button>
  )
}

export function TrackCard({ track, onPlay }: { track: Track; onPlay: () => void }) {
  const openMenu = useOpenMenu()
  return (
    <div
      className="card lift group w-40 flex-shrink-0 p-2.5 rounded-2xl cursor-pointer"
      onClick={onPlay}
      onMouseEnter={() => window.zsound.prefetch(track.id)}
      onContextMenu={(e) => openMenu(e, track)}
    >
      <div className="relative mb-2 overflow-hidden rounded-xl">
        <Cover src={track.thumbnail} size={320} className="cover-zoom w-full aspect-square" rounded="rounded-xl" />
        <PlayFab onClick={(e) => { e.stopPropagation(); onPlay() }} />
      </div>
      <div className="text-sm text-zs-text truncate">{track.title}</div>
      <div className="text-xs text-zs-muted truncate">{track.artist}</div>
    </div>
  )
}

export function CollectionCard({ item, onOpen }: { item: Collection; onOpen: () => void }) {
  return (
    <div className="card lift group w-40 flex-shrink-0 p-2.5 rounded-2xl cursor-pointer" onClick={onOpen}>
      <div className="relative mb-2 overflow-hidden rounded-xl">
        <Cover src={item.thumbnail} size={320} className="cover-zoom w-full aspect-square" rounded="rounded-xl" />
      </div>
      <div className="text-sm text-zs-text truncate">{item.title}</div>
      <div className="text-xs text-zs-muted line-clamp-2">{item.subtitle}</div>
    </div>
  )
}

export function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-semibold text-zs-text mb-3 px-1">{title}</h2>
      <div className="flex gap-1 overflow-x-auto pb-2 scrollbar-thin -mx-1">{children}</div>
    </section>
  )
}
