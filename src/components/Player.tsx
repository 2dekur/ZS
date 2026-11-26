import { useEffect, useRef, useState } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import {
  Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Repeat1, Heart, Volume2, Volume1, VolumeX,
  ListMusic, MicVocal, LoaderCircle, Sparkles, PictureInPicture2,
} from 'lucide-react'
import {
  currentTrackAtom, isPlayingAtom, isBufferingAtom, volumeAtom, mutedAtom, shuffleAtom, repeatAtom,
  toggleShuffleAtom, cycleRepeatAtom, likedIdsAtom, toggleLikeAtom, panelAtom, streamMetaAtom, navigateAtom,
} from '../store/player'
import { events, current } from '../audio/engine'
import { next, previous, seek } from '../audio/controller'
import { Cover, IconBtn, formatTime, useOpenMenu, ArtistLink } from './ui'
import { useT } from '../i18n'

function Seekbar() {
  const [time, setTime] = useState(current().currentTime)
  const [duration, setDuration] = useState(current().duration || 0)
  const [buffered, setBuffered] = useState(0)
  const [drag, setDrag] = useState<number | null>(null)
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onTime = () => {
      const a = current()
      setTime(a.currentTime)
      setBuffered(a.buffered.length ? a.buffered.end(a.buffered.length - 1) : 0)
    }
    const onDur = () => setDuration(Number.isFinite(current().duration) ? current().duration : 0)
    const onEmpty = () => { setTime(0); setBuffered(0) }
    const subs: [string, () => void][] = [['timeupdate', onTime], ['progress', onTime], ['durationchange', onDur], ['emptied', onEmpty]]
    for (const [type, fn] of subs) events.addEventListener(type, fn)
    return () => { for (const [type, fn] of subs) events.removeEventListener(type, fn) }
  }, [])

  const pctAt = (clientX: number) => {
    const r = barRef.current!.getBoundingClientRect()
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width))
  }
  const onDown = (e: React.PointerEvent) => {
    if (!duration) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag(pctAt(e.clientX))
  }
  const onMove = (e: React.PointerEvent) => { if (drag !== null) setDrag(pctAt(e.clientX)) }
  const onUp = (e: React.PointerEvent) => {
    if (drag === null) return
    seek(pctAt(e.clientX) * duration)
    setTime(pctAt(e.clientX) * duration)
    setDrag(null)
  }

  const pct = drag ?? (duration ? time / duration : 0)
  return (
    <div className="flex items-center gap-2 w-full">
      <span className="text-[11px] text-zs-muted w-10 text-right tabular-nums">{formatTime(drag !== null ? drag * duration : time)}</span>
      <div ref={barRef} className="group relative flex-1 h-4 flex items-center cursor-pointer" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}>
        <div className="relative w-full h-1 rounded-full bg-white/10 overflow-hidden">
          <div className="absolute inset-y-0 left-0 bg-white/10" style={{ width: `${duration ? (buffered / duration) * 100 : 0}%` }} />
          <div className="absolute inset-y-0 left-0 rounded-full bg-zs-text group-hover:bg-zs-accent-light" style={{ width: `${pct * 100}%` }} />
        </div>
        <div className="absolute w-3 h-3 rounded-full bg-[#eef2fb] opacity-0 group-hover:opacity-100 -translate-x-1/2 shadow" style={{ left: `${pct * 100}%` }} />
      </div>
      <span className="text-[11px] text-zs-muted w-10 tabular-nums">{formatTime(duration)}</span>
    </div>
  )
}

function QualityLabel() {
  const meta = useAtomValue(streamMetaAtom)
  const t = useT()
  if (!meta) return null
  const zs = meta.quality === 'zs'
  const detail = `${meta.codec} ${meta.kbps} kbps · ${meta.sampleRate ? `${meta.sampleRate / 1000} kHz` : ''}${meta.engine === 'zs' ? ' · ZS Engine' : ''}`
  return (
    <span title={detail} className={`inline-flex items-center gap-1 text-[11px] font-semibold ${zs ? 'zs-badge' : 'text-zs-muted'}`}>
      {zs && <Sparkles className="w-3 h-3" />}
      {t(`q.${meta.quality}` as const)}
    </span>
  )
}

export default function Player() {
  const track = useAtomValue(currentTrackAtom)
  const [isPlaying, setIsPlaying] = useAtom(isPlayingAtom)
  const buffering = useAtomValue(isBufferingAtom)
  const [volume, setVolume] = useAtom(volumeAtom)
  const [muted, setMuted] = useAtom(mutedAtom)
  const shuffle = useAtomValue(shuffleAtom)
  const repeat = useAtomValue(repeatAtom)
  const toggleShuffle = useSetAtom(toggleShuffleAtom)
  const cycleRepeat = useSetAtom(cycleRepeatAtom)
  const likedIds = useAtomValue(likedIdsAtom)
  const toggleLike = useSetAtom(toggleLikeAtom)
  const [panel, setPanel] = useAtom(panelAtom)
  const navigate = useSetAtom(navigateAtom)
  const openMenu = useOpenMenu()
  const t = useT()

  const vol = muted ? 0 : volume
  const VolIcon = vol === 0 ? VolumeX : vol < 0.5 ? Volume1 : Volume2
  const liked = track ? likedIds.has(track.id) : false

  return (
    <div className="player-bar mx-2 mb-2 h-[84px] flex-shrink-0 grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)] items-center px-3 gap-4">
      <div className="flex items-center gap-3 min-w-0">
        {track && (
          <>
            <Cover key={track.id} src={track.thumbnail} size={120} className="cover-in w-14 h-14" rounded="rounded-xl" />
            <div className="min-w-0" onContextMenu={(e) => openMenu(e, track)}>
              <div
                className={`text-sm font-semibold truncate text-zs-text ${track.albumId ? 'hover:underline cursor-pointer' : ''}`}
                onClick={() => track.albumId && navigate({ kind: 'collection', id: track.albumId })}
              >
                {track.title}
              </div>
              <ArtistLink track={track} />
              <QualityLabel />
            </div>
            <IconBtn title={t(liked ? 'menu.unlike' : 'menu.like')} active={liked} onClick={() => toggleLike(track)} className="w-8 h-8 flex-shrink-0">
              <Heart className="w-4 h-4" fill={liked ? 'currentColor' : 'none'} />
            </IconBtn>
          </>
        )}
      </div>

      <div className="flex flex-col items-center gap-1 min-w-0">
        <div className="flex items-center gap-4">
          <IconBtn title={t(shuffle ? 'player.shuffleOff' : 'player.shuffleOn')} active={shuffle} onClick={() => toggleShuffle()} className="w-8 h-8">
            <Shuffle className="w-4 h-4" />
          </IconBtn>
          <IconBtn title={`${t('player.prev')} (Ctrl+←)`} onClick={previous} disabled={!track} className="w-8 h-8">
            <SkipBack className="w-5 h-5" fill="currentColor" />
          </IconBtn>
          <button
            type="button"
            title={`${t(isPlaying ? 'player.pause' : 'player.play')} (Space)`}
            aria-label={t(isPlaying ? 'player.pause' : 'player.play')}
            disabled={!track}
            onClick={() => setIsPlaying((p) => !p)}
            className="btn-primary w-10 h-10 disabled:opacity-30"
          >
            {buffering && isPlaying
              ? <LoaderCircle className="w-5 h-5 animate-spin" />
              : isPlaying ? <Pause className="w-4 h-4" fill="currentColor" /> : <Play className="w-4 h-4 ml-0.5" fill="currentColor" />}
          </button>
          <IconBtn title={`${t('player.next')} (Ctrl+→)`} onClick={next} disabled={!track} className="w-8 h-8">
            <SkipForward className="w-5 h-5" fill="currentColor" />
          </IconBtn>
          <IconBtn title={t('player.repeat')} active={repeat !== 'off'} onClick={() => cycleRepeat()} className="w-8 h-8">
            {repeat === 'one' ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
          </IconBtn>
        </div>
        <div className="w-full max-w-xl"><Seekbar /></div>
      </div>

      <div className="flex items-center justify-end gap-2 min-w-0">
        <IconBtn title={t('player.lyrics')} active={panel === 'lyrics'} onClick={() => setPanel(panel === 'lyrics' ? 'none' : 'lyrics')} className="w-8 h-8">
          <MicVocal className="w-4 h-4" />
        </IconBtn>
        <IconBtn title={t('player.mini')} onClick={() => window.zsound.toggleMini()} className="w-8 h-8">
          <PictureInPicture2 className="w-4 h-4" />
        </IconBtn>
        <IconBtn title={t('player.queue')} active={panel === 'queue'} onClick={() => setPanel(panel === 'queue' ? 'none' : 'queue')} className="w-8 h-8">
          <ListMusic className="w-4 h-4" />
        </IconBtn>
        <IconBtn title={`${t(muted ? 'player.unmute' : 'player.mute')} (M)`} onClick={() => setMuted(!muted)} className="w-8 h-8">
          <VolIcon className="w-4 h-4" />
        </IconBtn>
        <input
          type="range"
          aria-label={t('player.volume')}
          min={0}
          max={1}
          step={0.01}
          value={vol}
          onChange={(e) => { setVolume(Number(e.target.value)); if (muted) setMuted(false) }}
          className="zs-range w-24"
          style={{ ['--fill' as string]: `${vol * 100}%` }}
        />
      </div>
    </div>
  )
}
