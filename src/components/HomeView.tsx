import { useEffect, useState } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { recentAtom, playContextAtom, playMixAtom, homeCacheAtom, settingsAtom } from '../store/player'
import { buildMixFor } from '../audio/controller'
import { TrackCard, CollectionCard, Row } from './Cards'
import { Cover, Skeleton } from './ui'
import { useT, langAtom, type Key } from '../i18n'
import type { Track } from '../types'

const mixCache = new Map<string, Track[]>()
const STALE_MS = 20 * 60_000

function greetingKey(): Key {
  const h = new Date().getHours()
  return h < 5 ? 'greet.night' : h < 12 ? 'greet.morning' : h < 18 ? 'greet.afternoon' : 'greet.evening'
}

export default function HomeView() {
  const lang = useAtomValue(langAtom)
  const [cache, setCache] = useAtom(homeCacheAtom)
  const [failed, setFailed] = useState(false)
  const recent = useAtomValue(recentAtom)
  const mode = useAtomValue(settingsAtom).algoMode ?? 'balanced'
  const seed = recent[0]
  const mixKey = seed ? `${seed.id}:${mode}` : ''
  const [mix, setMix] = useState<Track[]>(mixCache.get(mixKey) ?? [])
  const playContext = useSetAtom(playContextAtom)
  const playMix = useSetAtom(playMixAtom)
  const t = useT()
  const shelves = cache?.key === lang ? cache.shelves : null

  // Show the saved feed instantly, refresh it in the background when stale.
  useEffect(() => {
    if (cache?.key === lang && Date.now() - cache.at < STALE_MS) return
    let live = true
    window.zsound.home()
      .then((s) => { if (live) setCache({ key: lang, at: Date.now(), shelves: s }) })
      .catch(() => { if (live && !shelves) setFailed(true) })
    return () => { live = false }
  }, [lang]) // eslint-disable-line react-hooks/exhaustive-deps

  // "Your ZS mix": built by the ZS algorithm from your last track, likes and recents.
  useEffect(() => {
    if (!seed) return
    const hit = mixCache.get(mixKey)
    if (hit) return setMix(hit)
    let live = true
    buildMixFor(seed, 16)
      .then((m) => { mixCache.set(mixKey, m); if (live) setMix(m) })
      .catch(() => {})
    return () => { live = false }
  }, [mixKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const quick = recent.slice(0, 6)

  return (
    <div className="p-6 space-y-8 view-in">
      <h1 className="text-4xl font-semibold text-zs-text">{t(greetingKey())}</h1>

      {quick.length > 0 && (
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-2" aria-label={t('home.recent')}>
          {quick.map((tr) => (
            <button
              key={tr.id}
              type="button"
              onClick={() => playMix(tr)}
              onMouseEnter={() => window.zsound.prefetch(tr.id)}
              className="quick-tile lift group flex items-center gap-3 rounded-xl overflow-hidden text-left"
            >
              <Cover src={tr.thumbnail} size={120} className="w-14 h-14" rounded="rounded-none" />
              <span className="text-sm font-semibold text-zs-text truncate pr-3 hl">{tr.title}</span>
            </button>
          ))}
        </div>
      )}

      {mix.length > 0 && (
        <Row title={t('home.mix')}>
          {mix.map((tr, i) => <TrackCard key={tr.id} track={tr} onPlay={() => playContext({ tracks: mix, index: i, name: t('home.mix') })} />)}
        </Row>
      )}

      {!shelves && !failed && (
        <div className="space-y-3">
          <Skeleton className="h-6 w-48" />
          <div className="flex gap-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="w-40 h-52 flex-shrink-0" />)}</div>
        </div>
      )}
      {failed && <p className="text-sm text-zs-muted">{t('home.offline')}</p>}

      {shelves?.map((s) => (
        <Row key={s.title} title={s.title}>
          {s.tracks.map((tr) => <TrackCard key={tr.id} track={tr} onPlay={() => playMix(tr)} />)}
          {s.collections.map((c) => <CollectionCard key={c.id} item={c} />)}
        </Row>
      ))}
    </div>
  )
}
