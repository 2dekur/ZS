import { useEffect, useState } from 'react'
import { useSetAtom } from 'jotai'
import { Play, Shuffle, Radio } from 'lucide-react'
import { playContextAtom, playMixAtom, shuffleAtom, navigateAtom, showToastAtom } from '../store/player'
import TrackList from './TrackList'
import { TrackCard, CollectionCard, Row } from './Cards'
import { Cover, IconBtn, Skeleton } from './ui'
import { useT } from '../i18n'
import type { ArtistPage } from '../types'

const cache = new Map<string, ArtistPage>()

export default function ArtistView({ id }: { id: string }) {
  const [page, setPage] = useState<ArtistPage | undefined>(cache.get(id))
  const [failed, setFailed] = useState(false)
  const playContext = useSetAtom(playContextAtom)
  const playMix = useSetAtom(playMixAtom)
  const setShuffle = useSetAtom(shuffleAtom)
  const navigate = useSetAtom(navigateAtom)
  const toast = useSetAtom(showToastAtom)
  const t = useT()

  useEffect(() => {
    setFailed(false)
    if (cache.has(id)) return setPage(cache.get(id))
    setPage(undefined)
    let live = true
    window.zsound.artist(id)
      .then((p) => { cache.set(id, p); if (live) setPage(p) })
      .catch(() => { if (live) setFailed(true) })
    return () => { live = false }
  }, [id])

  if (failed) return <p className="p-6 text-sm text-zs-muted">{t('col.loadFail')}</p>
  if (!page) {
    return (
      <div className="p-6 space-y-4">
        <div className="flex items-end gap-6"><Skeleton className="w-48 h-48 !rounded-full" /><Skeleton className="h-14 w-80" /></div>
        {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    )
  }

  const startRadio = () => {
    if (!page.radio) return page.topSongs[0] && playMix(page.topSongs[0])
    toast(t('toast.radio', { t: page.name }))
    window.zsound.radio(page.radio.videoId, page.radio.playlistId)
      .then((tracks) => playContext({ tracks, index: 0, name: `${t('artist.radio')} · ${page.name}` }))
      .catch(() => toast(t('toast.radioFail')))
  }

  return (
    <div className="p-6 space-y-8 view-in">
      <div className="flex items-end gap-6">
        <Cover src={page.thumbnail} size={544} className="w-48 h-48 shadow-2xl" rounded="rounded-full" />
        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-zs-muted uppercase tracking-widest">{t('artist.kind')}</div>
          <div className="text-6xl font-semibold text-zs-text my-2 truncate">{page.name}</div>
          {page.subtitle && <div className="text-sm text-zs-muted">{page.subtitle}</div>}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button
          type="button"
          aria-label={t('col.play')}
          title={t('col.play')}
          disabled={!page.topSongs.length}
          onClick={() => { setShuffle(false); playContext({ tracks: page.topSongs, index: 0, name: page.name }) }}
          className="btn-primary w-14 h-14 disabled:opacity-30"
        >
          <Play className="w-6 h-6 ml-0.5" fill="currentColor" />
        </button>
        <IconBtn
          title={t('col.shuffle')}
          disabled={!page.topSongs.length}
          onClick={() => { setShuffle(true); playContext({ tracks: page.topSongs, index: Math.floor(Math.random() * page.topSongs.length), name: page.name }) }}
          className="w-10 h-10"
        >
          <Shuffle className="w-6 h-6" />
        </IconBtn>
        <IconBtn title={t('artist.radio')} onClick={startRadio} className="w-10 h-10">
          <Radio className="w-6 h-6" />
        </IconBtn>
      </div>

      {page.topSongs.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between mb-3 px-1">
            <h2 className="text-xl font-semibold text-zs-text">{t('artist.top')}</h2>
            {page.topSongsPlaylist && (
              <button type="button" onClick={() => navigate({ kind: 'collection', id: page.topSongsPlaylist! })} className="text-xs font-semibold text-zs-muted hover:text-zs-accent-light">
                {t('artist.all')}
              </button>
            )}
          </div>
          <TrackList tracks={page.topSongs} contextName={page.name} />
        </section>
      )}

      {page.shelves.map((s) => (
        <Row key={s.title} title={s.title}>
          {s.tracks.map((tr) => <TrackCard key={tr.id} track={tr} onPlay={() => playMix(tr)} />)}
          {s.collections.map((c) => <CollectionCard key={c.id} item={c} />)}
        </Row>
      ))}
    </div>
  )
}
