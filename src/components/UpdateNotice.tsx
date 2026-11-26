import { useAtom, useAtomValue } from 'jotai'
import { X, Sparkles, Download, RotateCw } from 'lucide-react'
import { updateStateAtom, dismissedUpdateAtom } from '../store/player'
import { useT } from '../i18n'

// Opt-in only: nothing downloads until the user clicks Update.
export default function UpdateNotice() {
  const state = useAtomValue(updateStateAtom)
  const [dismissed, setDismissed] = useAtom(dismissedUpdateAtom)
  const t = useT()

  if (state.status !== 'available' && state.status !== 'downloading' && state.status !== 'ready') return null
  if (state.status === 'available' && dismissed === state.version) return null

  return (
    <div role="dialog" aria-label={state.status === 'available' ? t('upd.noticeTitle', { v: state.version }) : t('upd.title')} className="ctx-menu fixed right-4 top-14 z-50 w-96 p-4 rounded-2xl pop-in">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 btn-primary">
          <Sparkles className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          {state.status === 'available' && (
            <>
              <div className="text-sm font-semibold text-zs-text">{t('upd.noticeTitle', { v: state.version })}</div>
              {state.notes && (
                <>
                  <div className="text-[11px] uppercase tracking-widest text-zs-muted mt-2 mb-1">{t('upd.notes')}</div>
                  <p className="text-xs text-zs-muted whitespace-pre-line max-h-32 overflow-y-auto scrollbar-thin">{state.notes}</p>
                </>
              )}
              <button type="button" onClick={() => window.zsound.downloadUpdate()} className="btn-primary mt-3 px-4 h-9 gap-2 text-sm">
                <Download className="w-4 h-4" />{t('upd.update')}
              </button>
            </>
          )}
          {state.status === 'downloading' && (
            <>
              <div className="text-sm font-semibold text-zs-text">{t('upd.downloading', { p: state.percent })}</div>
              <div className="mt-3 h-1 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full bg-zs-accent-light transition-[width]" style={{ width: `${state.percent}%` }} />
              </div>
            </>
          )}
          {state.status === 'ready' && (
            <button type="button" onClick={() => window.zsound.installUpdate()} className="btn-primary px-4 h-9 gap-2 text-sm">
              <RotateCw className="w-4 h-4" />{t('upd.restart')}
            </button>
          )}
        </div>
        {state.status === 'available' && (
          <button type="button" aria-label={t('upd.dismiss')} title={t('upd.dismiss')} onClick={() => setDismissed(state.version)} className="text-zs-muted hover:text-zs-accent-light">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  )
}
