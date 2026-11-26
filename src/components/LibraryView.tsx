import { useEffect, useRef, useState } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { Heart, Plus, Import, LoaderCircle } from 'lucide-react'
import { likedAtom, playlistsAtom, navigateAtom, createPlaylistAtom, showToastAtom } from '../store/player'
import { Cover } from './ui'
import { useT } from '../i18n'

function ImportDialog({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState(false)
  const createPlaylist = useSetAtom(createPlaylistAtom)
  const navigate = useSetAtom(navigateAtom)
  const toast = useSetAtom(showToastAtom)
  const input = useRef<HTMLInputElement>(null)
  const t = useT()

  useEffect(() => {
    input.current?.focus()
    return window.zsound.onImportProgress(setProgress)
  }, [])

  const run = async () => {
    if (!url.trim() || busy) return
    setBusy(true)
    setError(false)
    try {
      const res = await window.zsound.importLink(url.trim())
      if (!res.tracks.length) throw new Error('empty')
      const id = createPlaylist({ name: res.name, tracks: res.tracks })
      toast(`${t('imp.done', { n: res.name, c: res.tracks.length })}${res.missed ? ` · ${t('imp.missed', { m: res.missed })}` : ''}`)
      onClose()
      navigate({ kind: 'playlist', id })
    } catch {
      setError(true)
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 fade-in" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div role="dialog" aria-label={t('lib.import')} className="ctx-menu w-[30rem] p-6 rounded-2xl pop-in">
        <h2 className="text-lg font-semibold text-zs-text">{t('lib.import')}</h2>
        <p className="text-xs text-zs-muted mt-1 mb-4">{t('imp.desc')}</p>
        <input
          ref={input}
          value={url}
          disabled={busy}
          onChange={(e) => { setUrl(e.target.value); setError(false) }}
          onKeyDown={(e) => { if (e.key === 'Enter') void run(); if (e.key === 'Escape' && !busy) onClose() }}
          placeholder="https://open.spotify.com/playlist/…"
          spellCheck={false}
          className="search-box w-full h-11 px-4 rounded-xl bg-transparent outline-none text-sm text-zs-text placeholder:text-zs-muted"
        />
        {error && <p role="alert" className="text-xs text-red-400 mt-2">{t('imp.error')}</p>}
        {busy && progress && (
          <div className="mt-4">
            <div className="text-xs text-zs-muted mb-1.5">{t('imp.progress', { d: progress.done, t: progress.total })}</div>
            <div className="h-1 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-zs-accent-light transition-[width]" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2 mt-5">
          <button type="button" disabled={busy} onClick={onClose} className="chip h-9 px-4 text-sm disabled:opacity-40">{t('imp.cancel')}</button>
          <button type="button" disabled={busy || !url.trim()} onClick={() => void run()} className="btn-primary h-9 px-4 gap-2 text-sm disabled:opacity-40">
            {busy && <LoaderCircle className="w-4 h-4 animate-spin" />}{t('imp.go')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function LibraryView() {
  const liked = useAtomValue(likedAtom)
  const playlists = useAtomValue(playlistsAtom)
  const navigate = useSetAtom(navigateAtom)
  const createPlaylist = useSetAtom(createPlaylistAtom)
  const [importing, setImporting] = useState(false)
  const t = useT()

  return (
    <div className="p-6 view-in">
      <h1 className="text-4xl font-semibold text-zs-text mb-6">{t('lib.title')}</h1>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3">
        <button
          type="button"
          onClick={() => navigate({ kind: 'liked' })}
          className="lift col-span-2 rounded-2xl p-5 flex flex-col justify-end text-left min-h-[14rem] border border-white/10"
          style={{ background: 'linear-gradient(135deg, #1c3fb8, #2a5bf0 55%, #0d1d55)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18)' }}
        >
          <Heart className="w-8 h-8 text-white mb-auto" fill="currentColor" />
          <div className="text-3xl font-semibold text-white">{t('lib.liked')}</div>
          <div className="text-sm text-white/75">{t('lib.songs', { n: liked.length })}</div>
        </button>
        {playlists.map((p) => (
          <button key={p.id} type="button" onClick={() => navigate({ kind: 'playlist', id: p.id })} className="card lift group p-2.5 rounded-2xl text-left">
            <Cover src={p.tracks[0]?.thumbnail} size={320} className="w-full aspect-square mb-2" rounded="rounded-xl" />
            <div className="text-sm text-zs-text truncate hl">{p.name}</div>
            <div className="text-xs text-zs-muted">{t('lib.songs', { n: p.tracks.length })}</div>
          </button>
        ))}
        <button
          type="button"
          onClick={() => navigate({ kind: 'playlist', id: createPlaylist({ name: t('lib.myPlaylist', { n: playlists.length + 1 }) }) })}
          className="card lift group p-2.5 rounded-2xl text-left"
        >
          <div className="w-full aspect-square mb-2 rounded-xl flex items-center justify-center border border-dashed border-white/15">
            <Plus className="w-8 h-8 text-zs-muted" />
          </div>
          <div className="text-sm text-zs-text hl">{t('lib.newPlaylist')}</div>
        </button>
        <button type="button" onClick={() => setImporting(true)} className="card lift group p-2.5 rounded-2xl text-left">
          <div className="w-full aspect-square mb-2 rounded-xl flex items-center justify-center border border-dashed border-white/15">
            <Import className="w-8 h-8 text-zs-muted" />
          </div>
          <div className="text-sm text-zs-text hl">{t('lib.import')}</div>
        </button>
      </div>
      {importing && <ImportDialog onClose={() => setImporting(false)} />}
    </div>
  )
}
