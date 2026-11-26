import React from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { ChevronLeft, Minus, Square, X } from 'lucide-react'
import { canGoBackAtom, backAtom } from '../store/player'
import { useT } from '../i18n'

// "Zsound" drawn as one monoline ribbon: the Z is the logo, the other letters share its stroke and gradient.
function Wordmark() {
  return (
    <svg height="17" viewBox="0 0 66 14" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Zsound">
      <defs>
        <linearGradient id="zs-word" x1="0" y1="0" x2="66" y2="14" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#a8c0ff" />
          <stop offset="1" stopColor="#3d6dff" />
        </linearGradient>
      </defs>
      <g stroke="url(#zs-word)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1.3 1.3 H9.5 C10.6 1.3 11 2.5 10.2 3.3 L2.4 10.7 C1.6 11.5 2 12.7 3.1 12.7 H11.3" />
        <path d="M20.5 5.3 H16.9 C15.1 5.3 15.1 9 16.9 9 H19.1 C20.9 9 20.9 12.7 19.1 12.7 H15.5" />
        <circle cx="28.4" cy="9" r="3.7" />
        <path d="M36.3 5.3 V9.4 C36.3 11.4 37.6 12.7 39.4 12.7 C41.2 12.7 42.5 11.4 42.5 9.4 M42.5 5.3 V12.7" />
        <path d="M46.7 12.7 V8.6 C46.7 6.6 48 5.3 49.8 5.3 C51.6 5.3 52.9 6.6 52.9 8.6 V12.7 M46.7 5.3 V12.7" />
        <circle cx="60.8" cy="9" r="3.7" />
        <path d="M64.5 1.3 V12.7" />
      </g>
    </svg>
  )
}

function WinBtn({ onClick, label, className = '', children }: { onClick: () => void; label: string; className?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`titlebar-no-drag w-11 h-10 flex items-center justify-center text-zs-muted hover:text-zs-accent-light hover:bg-white/[0.06] transition-colors ${className}`}
    >
      {children}
    </button>
  )
}

export default function Titlebar() {
  const canGoBack = useAtomValue(canGoBackAtom)
  const back = useSetAtom(backAtom)
  const t = useT()
  return (
    <div className="titlebar-drag flex items-center h-10 flex-shrink-0 select-none">
      <div className="titlebar-no-drag flex items-center gap-2 pl-4">
        <Wordmark />
        <button
          type="button"
          title={t('nav.back')}
          aria-label={t('nav.back')}
          disabled={!canGoBack}
          onClick={() => back()}
          className="ml-3 w-7 h-7 rounded-full flex items-center justify-center text-zs-text hover:bg-white/10 disabled:opacity-30"
          style={{ background: 'var(--glass-strong)' }}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 titlebar-drag" />
      <div className="flex items-center">
        <WinBtn label="Minimize" onClick={() => window.zsound.minimize()}><Minus className="w-4 h-4" /></WinBtn>
        <WinBtn label="Maximize" onClick={() => window.zsound.maximize()}><Square className="w-3.5 h-3.5" /></WinBtn>
        <WinBtn label="Close" onClick={() => window.zsound.close()} className="hover:!bg-[#c42b1c] hover:!text-white"><X className="w-4 h-4" /></WinBtn>
      </div>
    </div>
  )
}
