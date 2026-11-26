import { useAtomValue, useSetAtom } from 'jotai'
import { Heart, Plus } from 'lucide-react'
import { likedAtom, playlistsAtom, navigateAtom, createPlaylistAtom } from '../store/player'
import { Cover } from './ui'
import { useT } from '../i18n'

export default function LibraryView() {
  const liked = useAtomValue(likedAtom)
  const playlists = useAtomValue(playlistsAtom)
  const navigate = useSetAtom(navigateAtom)
  const createPlaylist = useSetAtom(createPlaylistAtom)
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
          <button key={p.id} type="button" onClick={() => navigate({ kind: 'playlist', id: p.id })} className="card lift p-2.5 rounded-2xl text-left">
            <Cover src={p.tracks[0]?.thumbnail} size={320} className="w-full aspect-square mb-2" rounded="rounded-xl" />
            <div className="text-sm text-zs-text truncate">{p.name}</div>
            <div className="text-xs text-zs-muted">{t('lib.songs', { n: p.tracks.length })}</div>
          </button>
        ))}
        <button
          type="button"
          onClick={() => navigate({ kind: 'playlist', id: createPlaylist({ name: t('lib.myPlaylist', { n: playlists.length + 1 }) }) })}
          className="card lift p-2.5 rounded-2xl text-left"
        >
          <div className="w-full aspect-square mb-2 rounded-xl flex items-center justify-center border border-dashed border-white/15">
            <Plus className="w-8 h-8 text-zs-muted" />
          </div>
          <div className="text-sm text-zs-text">{t('lib.newPlaylist')}</div>
        </button>
      </div>
    </div>
  )
}
