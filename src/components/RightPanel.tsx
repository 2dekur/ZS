import { useEffect, useRef, useState } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { X } from 'lucide-react'
import {
  panelAtom, contextAtom, userQueueAtom, currentTrackAtom, jumpQueueAtom, jumpContextAtom, removeQueuedAtom,
  removeUpcomingAtom, clearQueueAtom, clearUpcomingAtom, settingsAtom,
} from '../store/player'
import { events, current as currentEl } from '../audio/engine'
import { seek } from '../audio/controller'
import { Cover, IconBtn, ArtistLink, useOpenMenu } from './ui'
import { useT } from '../i18n'
import type { LyricLine, Track } from '../types'

function QueueRow({ track, onPlay, onRemove }: { track: Track; onPlay: () => void; onRemove: () => void }) {
  const openMenu = useOpenMenu()
  const t = useT()
  return (
    <div
      className="track-row group flex items-center gap-3 p-1.5 cursor-pointer"
      onClick={onPlay}
      onMouseEnter={() => window.zsound.prefetch(track.id)}
      onContextMenu={(e) => openMenu(e, track)}
    >
      <Cover src={track.thumbnail} size={96} className="w-10 h-10" rounded="rounded-lg" />
      <div className="min-w-0 flex-1">
        <div className="text-sm text-zs-text truncate hl">{track.title}</div>
        <ArtistLink track={track} />
      </div>
      <IconBtn title={t('queue.remove')} onClick={(e) => { e.stopPropagation(); onRemove() }} className="w-7 h-7 opacity-0 group-hover:opacity-100">
        <X className="w-4 h-4" />
      </IconBtn>
    </div>
  )
}

function SectionTitle({ title, onClear }: { title: string; onClear?: () => void }) {
  const t = useT()
  return (
    <div className="flex items-center justify-between mb-2 gap-2">
      <h3 className="text-[11px] font-semibold text-zs-muted uppercase tracking-widest truncate">{title}</h3>
      {onClear && <button type="button" onClick={onClear} className="text-xs text-zs-muted hover:text-zs-accent-light flex-shrink-0">{t('queue.clear')}</button>}
    </div>
  )
}

function QueuePanel() {
  const current = useAtomValue(currentTrackAtom)
  const queue = useAtomValue(userQueueAtom)
  const context = useAtomValue(contextAtom)
  const jumpQueue = useSetAtom(jumpQueueAtom)
  const jumpContext = useSetAtom(jumpContextAtom)
  const removeQueued = useSetAtom(removeQueuedAtom)
  const removeUpcoming = useSetAtom(removeUpcomingAtom)
  const clearQueue = useSetAtom(clearQueueAtom)
  const clearUpcoming = useSetAtom(clearUpcomingAtom)
  const autoplay = useAtomValue(settingsAtom).autoplay
  const t = useT()
  const upcoming = context.tracks.slice(context.index + 1)

  return (
    <div className="flex flex-col gap-5">
      {current && (
        <section>
          <SectionTitle title={t('queue.nowPlaying')} />
          <div className="track-row active flex items-center gap-3 p-2">
            <Cover src={current.thumbnail} size={96} className="w-11 h-11" rounded="rounded-lg" />
            <div className="min-w-0">
              <div className="text-sm text-zs-accent-light font-medium truncate">{current.title}</div>
              <ArtistLink track={current} />
            </div>
          </div>
        </section>
      )}

      {queue.length > 0 && (
        <section>
          <SectionTitle title={t('queue.yours')} onClear={() => clearQueue()} />
          <div className="flex flex-col gap-0.5">
            {queue.map((tr, i) => (
              <QueueRow key={`q-${tr.id}-${i}`} track={tr} onPlay={() => jumpQueue(i)} onRemove={() => removeQueued(i)} />
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionTitle
          title={context.name ? t('queue.from', { n: context.name }) : t('queue.nextUp', { n: upcoming.length })}
          onClear={upcoming.length ? () => clearUpcoming() : undefined}
        />
        {upcoming.length === 0 && <p className="text-xs text-zs-muted px-1">{t(autoplay || context.mixSeed ? 'queue.autoplayHint' : 'queue.empty')}</p>}
        <div className="flex flex-col gap-0.5">
          {upcoming.map((tr, i) => {
            const pos = context.index + 1 + i
            return <QueueRow key={`c-${tr.id}-${pos}`} track={tr} onPlay={() => jumpContext(pos)} onRemove={() => removeUpcoming(pos)} />
          })}
        </div>
      </section>
    </div>
  )
}

function SyncedLyrics({ lines }: { lines: LyricLine[] }) {
  const [active, setActive] = useState(-1)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onTime = () => {
      const now = currentEl().currentTime + 0.25
      let i = lines.findIndex((l) => l.time > now) - 1
      if (i === -2) i = lines.length - 1
      setActive(i)
    }
    onTime()
    events.addEventListener('timeupdate', onTime)
    return () => events.removeEventListener('timeupdate', onTime)
  }, [lines])

  // Scroll only when the line leaves the middle band: one smooth scroll every few lines instead of every line (CPU).
  useEffect(() => {
    const line = box.current?.querySelector<HTMLElement>(`[data-line="${active}"]`)
    const pane = box.current?.parentElement
    if (!line || !pane) return
    const view = pane.getBoundingClientRect()
    const at = (line.getBoundingClientRect().top - view.top) / view.height
    if (at < 0.25 || at > 0.6) line.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [active])

  return (
    <div ref={box} className="flex flex-col gap-3 py-[30vh]">
      {lines.map((l, i) => (
        <button
          key={`${l.time}-${i}`}
          type="button"
          data-line={i}
          onClick={() => seek(l.time)}
          className={`text-left text-[19px] leading-snug font-semibold ${
            i === active ? 'text-zs-accent-light' : i < active ? 'text-zs-text/40 hover:text-zs-text/70' : 'text-zs-text/60 hover:text-zs-text'
          }`}
        >
          {l.text || '♪'}
        </button>
      ))}
    </div>
  )
}

function LyricsPanel() {
  const track = useAtomValue(currentTrackAtom)
  const [state, setState] = useState<{ id: string; synced: LyricLine[] | null; text: string | null } | null>(null)
  const t = useT()

  useEffect(() => {
    if (!track) return
    let live = true
    setState(null)
    window.zsound.syncedLyrics(track.id, { title: track.title, artist: track.artist, duration: track.duration })
      .then(async (synced) => {
        const text = synced ? null : await window.zsound.lyrics(track.id)
        if (live) setState({ id: track.id, synced, text })
      })
      .catch(() => { if (live) setState({ id: track.id, synced: null, text: null }) })
    return () => { live = false }
  }, [track?.id])

  if (!track) return <p className="text-sm text-zs-muted">{t('lyrics.idle')}</p>
  if (!state) return <p className="text-sm text-zs-muted animate-pulse">{t('lyrics.loading')}</p>
  if (state.synced) return <SyncedLyrics lines={state.synced} />
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
