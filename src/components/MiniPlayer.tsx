import { useEffect, useState } from 'react'
import { Play, Pause, SkipBack, SkipForward, X } from 'lucide-react'
import { Cover } from './ui'
import type { NowPlaying } from '../types'

// Always-on-top mini window: shows what the main window plays and sends it commands.
export default function MiniPlayer() {
  const [np, setNp] = useState<NowPlaying | null>(null)
  useEffect(() => window.zsound.onNowPlaying(setNp), [])

  return (
    <div className="app-root titlebar-drag h-screen flex items-center gap-3 px-3 select-none">
      <Cover src={np?.thumbnail} size={120} className="w-[72px] h-[72px] flex-shrink-0" rounded="rounded-xl" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-zs-text truncate">{np?.title ?? 'Zsound'}</div>
        <div className="text-xs text-zs-muted truncate">{np?.artist ?? ''}</div>
        <div className="titlebar-no-drag flex items-center gap-3 mt-2">
          <button type="button" aria-label="Previous" onClick={() => window.zsound.sendCommand('previous')} className="text-zs-muted hover:text-zs-accent-light">
            <SkipBack className="w-4 h-4" fill="currentColor" />
          </button>
          <button type="button" aria-label={np?.playing ? 'Pause' : 'Play'} onClick={() => window.zsound.sendCommand('toggle')} className="btn-primary w-8 h-8">
            {np?.playing ? <Pause className="w-3.5 h-3.5" fill="currentColor" /> : <Play className="w-3.5 h-3.5 ml-0.5" fill="currentColor" />}
          </button>
          <button type="button" aria-label="Next" onClick={() => window.zsound.sendCommand('next')} className="text-zs-muted hover:text-zs-accent-light">
            <SkipForward className="w-4 h-4" fill="currentColor" />
          </button>
        </div>
      </div>
      <button type="button" aria-label="Close" onClick={() => window.zsound.close()} className="titlebar-no-drag self-start mt-1 text-zs-muted hover:text-zs-accent-light">
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
