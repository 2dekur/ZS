import React, { useState } from 'react'
import { useSetAtom } from 'jotai'
import { AudioLines } from 'lucide-react'
import { contextMenuAtom } from '../store/player'
import type { Track } from '../types'

export function formatTime(s: number) {
  if (!s || !Number.isFinite(s)) return '0:00'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60).toString().padStart(2, '0')
  return h ? `${h}:${m.toString().padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

// Ask Google's image CDN for the size we display (2x for HiDPI) instead of decoding 544px everywhere.
export function sized(src: string | undefined, px: number) {
  return src?.replace(/=w\d+-h\d+/, `=w${px}-h${px}`)
}

export function Cover({ src, size = 96, className = '', rounded = 'rounded-lg' }: { src?: string; size?: number; className?: string; rounded?: string }) {
  const [failed, setFailed] = useState<string | null>(null)
  const url = sized(src, size)
  if (!url || failed === url) {
    return (
      <div className={`${className} ${rounded} flex items-center justify-center flex-shrink-0`} style={{ background: 'linear-gradient(135deg, rgba(42,91,240,0.35), #0b1020)' }}>
        <AudioLines className="w-1/3 h-1/3 text-white/40" />
      </div>
    )
  }
  return <img src={url} alt="" draggable={false} loading="lazy" decoding="async" onError={() => setFailed(url)} className={`${className} ${rounded} object-cover flex-shrink-0 bg-zs-surface`} />
}

export function IconBtn({ onClick, title, active, disabled, className = '', children }: {
  onClick?: (e: React.MouseEvent) => void
  title: string
  active?: boolean
  disabled?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`flex items-center justify-center rounded-full transition-colors disabled:opacity-30 disabled:pointer-events-none ${
        active ? 'text-zs-accent-light' : 'text-zs-muted hover:text-zs-accent-light'
      } ${className}`}
    >
      {children}
    </button>
  )
}

export function useOpenMenu() {
  const set = useSetAtom(contextMenuAtom)
  return (e: React.MouseEvent, track: Track, extra: { playlistId?: string; index?: number } = {}) => {
    e.preventDefault()
    e.stopPropagation()
    set({ x: e.clientX, y: e.clientY, track, ...extra })
  }
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton rounded-xl ${className}`} />
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className="relative w-10 h-6 rounded-full transition-colors flex-shrink-0 border border-white/10"
      style={{ background: on ? 'var(--zs-accent)' : 'rgba(255,255,255,0.1)' }}
    >
      <span className="absolute top-[3px] w-4 h-4 rounded-full bg-[#eef2fb] transition-all" style={{ left: on ? 19 : 3 }} />
    </button>
  )
}
