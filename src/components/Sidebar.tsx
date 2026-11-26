import { useAtomValue, useSetAtom } from 'jotai'
import { House, Search, Library, Settings, Plus, Heart } from 'lucide-react'
import { viewAtom, navigateAtom, playlistsAtom, likedAtom, createPlaylistAtom } from '../store/player'
import { Cover } from './ui'
import { useT } from '../i18n'
import type { View } from '../types'

const NAV = [
  { kind: 'home', key: 'nav.home', Icon: House },
  { kind: 'search', key: 'nav.search', Icon: Search },
  { kind: 'library', key: 'nav.library', Icon: Library },
] as const

export default function Sidebar() {
  const view = useAtomValue(viewAtom)
  const navigate = useSetAtom(navigateAtom)
  const playlists = useAtomValue(playlistsAtom)
  const liked = useAtomValue(likedAtom)
  const createPlaylist = useSetAtom(createPlaylistAtom)
  const t = useT()
  const is = (v: View) => JSON.stringify(v) === JSON.stringify(view)

  const newPlaylist = () => {
    const id = createPlaylist({ name: t('lib.myPlaylist', { n: playlists.length + 1 }) })
    navigate({ kind: 'playlist', id })
  }

  return (
    <aside className="panel w-60 flex-shrink-0 flex flex-col py-3 px-2 gap-1">
      {NAV.map(({ kind, key, Icon }) => (
        <button key={kind} type="button" onClick={() => navigate({ kind })} className={`nav-item ${view.kind === kind ? 'active' : ''}`}>
          <Icon className="w-5 h-5" />
          {t(key)}
        </button>
      ))}

      <div className="mt-4 mb-1 px-3 flex items-center justify-between">
        <span className="text-[11px] font-semibold text-zs-muted uppercase tracking-widest">{t('nav.yourMusic')}</span>
        <button type="button" title={t('lib.newPlaylist')} aria-label={t('lib.newPlaylist')} onClick={newPlaylist} className="text-zs-muted hover:text-zs-accent-light">
          <Plus className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin flex flex-col gap-0.5">
        <button type="button" onClick={() => navigate({ kind: 'liked' })} className={`lib-item group ${is({ kind: 'liked' }) ? 'active' : ''}`}>
          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, #2a5bf0, #0f2a7a)' }}>
            <Heart className="w-4 h-4 text-white" fill="currentColor" />
          </div>
          <div className="min-w-0 text-left">
            <div className="text-sm text-zs-text truncate hl">{t('lib.liked')}</div>
            <div className="text-xs text-zs-muted">{t('lib.songs', { n: liked.length })}</div>
          </div>
        </button>
        {playlists.map((p) => (
          <button key={p.id} type="button" onClick={() => navigate({ kind: 'playlist', id: p.id })} className={`lib-item group ${is({ kind: 'playlist', id: p.id }) ? 'active' : ''}`}>
            <Cover src={p.tracks[0]?.thumbnail} size={96} className="w-9 h-9" rounded="rounded-lg" />
            <div className="min-w-0 text-left">
              <div className="text-sm text-zs-text truncate hl">{p.name}</div>
              <div className="text-xs text-zs-muted">{t('lib.songs', { n: p.tracks.length })}</div>
            </div>
          </button>
        ))}
      </div>

      <button type="button" onClick={() => navigate({ kind: 'settings' })} className={`nav-item ${view.kind === 'settings' ? 'active' : ''}`}>
        <Settings className="w-5 h-5" />
        {t('nav.settings')}
      </button>
    </aside>
  )
}
