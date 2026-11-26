import { useEffect, useState } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { X } from 'lucide-react'
import {
  panelAtom, queueAtom, queueIndexAtom, currentTrackAtom, jumpToAtom, removeFromQueueAtom, clearUpcomingAtom, settingsAtom,
} from '../store/player'
import { Cover, IconBtn, useOpenMenu } from './ui'
import { useT } from '../i18n'

function QueuePanel() {
  const queue = useAtomValue(queueAtom)
  const index = useAtomValue(queueIndexAtom)
  const jumpTo = useSetAtom(jumpToAtom)
  const remove = useSetAtom(removeFromQueueAtom)
  const clear = useSetAtom(clearUpcomingAtom)
  const autoplay = useAtomValue(settingsAtom).autoplay
  const openMenu = useOpenMenu()
  const t = useT()
  const current = queue[index]
  const upcoming = queue.slice(index + 1)

  return (
    <div className="flex flex-col gap-4">
      {current && (
        <section>
          <h3 className="text-[11px] font-semibold text-zs-muted uppercase tracking-widest mb-2">{t('queue.nowPlaying')}</h3>
          <div className="track-row active flex items-center gap-3 p-2">
            <Cover src={current.thumbnail} size={96} className="w-11 h-11" rounded="rounded-lg" />
            <div className="min-w-0">
              <div className="text-sm text-zs-accent-light font-medium truncate">{current.title}</div>
              <div className="text-xs text-zs-muted truncate">{current.artist}</div>
            </div>
          </div>
        </section>
      )}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[11px] font-semibold text-zs-muted uppercase tracking-widest">{t('queue.nextUp', { n: upcoming.length })}</h3>
          {upcoming.length > 0 && (
            <button type="button" onClick={() => clear()} className="text-xs text-zs-muted hover:text-zs-text">{t('queue.clear')}</button>
          )}
        </div>
        {upcoming.length === 0 && <p className="text-xs text-zs-muted px-1">{t(autoplay ? 'queue.autoplayHint' : 'queue.empty')}</p>}
        <div className="flex flex-col gap-0.5">
          {upcoming.map((tr, i) => {
            const pos = index + 1 + i
            return (
              <div
                key={`${tr.id}-${pos}`}
                className="track-row group flex items-center gap-3 p-1.5 cursor-pointer"
                onClick={() => jumpTo(pos)}
                onMouseEnter={() => window.zsound.prefetch(tr.id)}
                onContextMenu={(e) => openMenu(e, tr)}
              >
                <Cover src={tr.thumbnail} size={96} className="w-10 h-10" rounded="rounded-lg" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-zs-text truncate">{tr.title}</div>
                  <div className="text-xs text-zs-muted truncate">{tr.artist}</div>
                </div>
                <IconBtn title={t('queue.remove')} onClick={(e) => { e.stopPropagation(); remove(pos) }} className="w-7 h-7 opacity-0 group-hover:opacity-100">
                  <X className="w-4 h-4" />
                </IconBtn>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function LyricsPanel() {
  const track = useAtomValue(currentTrackAtom)
  const [state, setState] = useState<{ id: string; text: string | null } | null>(null)
  const t = useT()

  useEffect(() => {
    if (!track) return
    let live = true
    setState(null)
    window.zsound.lyrics(track.id).then((text) => { if (live) setState({ id: track.id, text }) })
    return () => { live = false }
  }, [track?.id])

  if (!track) return <p className="text-sm text-zs-muted">{t('lyrics.idle')}</p>
  if (!state) return <p className="text-sm text-zs-muted animate-pulse">{t('lyrics.loading')}</p>
  if (!state.text) return <p className="text-sm text-zs-muted">{t('lyrics.none')}</p>
  return <p className="whitespace-pre-wrap text-[16px] leading-8 text-zs-text select-text fade-in">{state.text}</p>
}

export default function RightPanel() {
  const [panel, setPanel] = useAtom(panelAtom)
  const t = useT()
  if (panel === 'none') return null
  return (
    <aside className="panel w-80 flex-shrink-0 flex flex-col overflow-hidden slide-in">
      <div className="flex items-center justify-between px-4 h-12 flex-shrink-0">
        <h2 className="text-sm font-semibold text-zs-text">{t(panel === 'queue' ? 'player.queue' : 'player.lyrics')}</h2>
        <IconBtn title={t('panel.close')} onClick={() => setPanel('none')} className="w-7 h-7">
          <X className="w-4 h-4" />
        </IconBtn>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin px-3 pb-4">
        {panel === 'queue' ? <QueuePanel /> : <LyricsPanel />}
      </div>
    </aside>
  )
}
