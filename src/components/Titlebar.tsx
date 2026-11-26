import React from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { ChevronLeft, Minus, Square, X } from 'lucide-react'
import { canGoBackAtom, backAtom } from '../store/player'
import { useT } from '../i18n'

function ZSLogo() {
  return (
    <svg width="22" height="22" viewBox="4 6 24 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="zs-blue" x1="6" y1="8" x2="26" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8fb0ff" />
          <stop offset="1" stopColor="#2a5bf0" />
        </linearGradient>
      </defs>
      <path d="M7 9 H17 C21 9 21.5 13 18.5 15 L11.5 19 C8.5 21 9 23 13 23 H25" stroke="url(#zs-blue)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function WinBtn({ onClick, label, className = '', children }: { onClick: () => void; label: string; className?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`titlebar-no-drag w-11 h-10 flex items-center justify-center text-zs-muted hover:text-zs-text hover:bg-white/[0.06] transition-colors ${className}`}
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
        <ZSLogo />
        <span className="text-[15px] font-semibold tracking-tight text-zs-text">Zsound</span>
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
