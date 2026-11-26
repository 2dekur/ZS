import { useEffect, useRef, useState } from 'react'
import { useAtom, useSetAtom } from 'jotai'
import { Search, X, Play, LoaderCircle } from 'lucide-react'
import { searchQueryAtom, searchResultsAtom, isSearchingAtom, playContextAtom } from '../store/player'
import TrackList from './TrackList'
import { Cover } from './ui'
import { useT } from '../i18n'

const BROWSE = ['Hits 2026', 'Rap FR', 'Afro', 'Drill', 'Pop', 'R&B', 'Chill', 'Workout', 'Lo-fi', 'Rock', 'Électro', 'Jazz']

export default function SearchView() {
  const [query, setQuery] = useAtom(searchQueryAtom)
  const [results, setResults] = useAtom(searchResultsAtom)
  const [busy, setBusy] = useAtom(isSearchingAtom)
  const playContext = useSetAtom(playContextAtom)
  const [sugg, setSugg] = useState<string[]>([])
  const [focused, setFocused] = useState(false)
  const [cursor, setCursor] = useState(-1)
  const req = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const t = useT()

  const run = (q: string) => {
    const id = ++req.current
    if (!q.trim()) { setResults([]); setBusy(false); return }
    setBusy(true)
    window.zsound.search(q)
      .then((r) => {
        if (id !== req.current) return
        setResults(r)
        r.slice(0, 5).forEach((tr) => window.zsound.prefetch(tr.id))
      })
      .catch(() => { if (id === req.current) setResults([]) })
      .finally(() => { if (id === req.current) setBusy(false) })
  }

  useEffect(() => {
    const timer = setTimeout(() => run(query), 120)
    return () => clearTimeout(timer)
  }, [query]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setCursor(-1)
    if (!query.trim() || !focused) return setSugg([])
    let live = true
    window.zsound.suggestions(query).then((s) => {
      if (!live) return
      const list = s.filter((x) => x !== query.toLowerCase()).slice(0, 6)
      setSugg(list)
      // Warm the top suggestion so picking it shows results instantly.
      if (list[0]) window.zsound.search(list[0]).catch(() => {})
    })
    return () => { live = false }
  }, [query, focused])

  const pick = (s: string) => {
    setQuery(s)
    run(s)
    setSugg([])
    inputRef.current?.blur()
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' && sugg.length) { e.preventDefault(); setCursor((c) => Math.min(sugg.length - 1, c + 1)) }
    else if (e.key === 'ArrowUp' && sugg.length) { e.preventDefault(); setCursor((c) => Math.max(-1, c - 1)) }
    else if (e.key === 'Enter') pick(cursor >= 0 ? sugg[cursor] : query)
    else if (e.key === 'Escape') { setSugg([]); inputRef.current?.blur() }
  }

  const top = results[0]

  return (
    <div className="p-6 view-in">
      <div className="relative max-w-xl mb-6 z-20">
        <div className="search-box flex items-center gap-3 px-4 h-12 rounded-full">
          {busy ? <LoaderCircle className="w-5 h-5 text-zs-muted animate-spin" /> : <Search className="w-5 h-5 text-zs-muted" />}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 120)}
            onKeyDown={onKey}
            placeholder={t('search.placeholder')}
            className="flex-1 bg-transparent outline-none text-zs-text placeholder:text-zs-muted text-[15px]"
            autoFocus
            spellCheck={false}
          />
          {query && (
            <button type="button" aria-label={t('search.clear')} onClick={() => { setQuery(''); inputRef.current?.focus() }} className="text-zs-muted hover:text-zs-accent-light">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {focused && sugg.length > 0 && (
          <div role="listbox" className="ctx-menu absolute left-0 right-0 top-14 p-1.5 rounded-2xl pop-in">
            {sugg.map((s, i) => (
              <button
                key={s}
                type="button"
                role="option"
                aria-selected={i === cursor}
                onMouseDown={(e) => { e.preventDefault(); pick(s) }}
                className={`group w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-left ${i === cursor ? 'bg-white/[0.08]' : 'hover:bg-white/[0.07]'}`}
              >
                <Search className="w-4 h-4 text-zs-muted hl" />
                <span className={`truncate hl ${i === cursor ? 'text-zs-accent-light' : 'text-zs-text'}`}>{s}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {!query.trim() && (
        <section>
          <h2 className="text-xl font-semibold text-zs-text mb-3">{t('search.browse')}</h2>
          <div className="grid grid-cols-3 xl:grid-cols-4 gap-3">
            {BROWSE.map((g, i) => (
              <button
                key={g}
                type="button"
                onClick={() => pick(g)}
                className="lift h-24 rounded-2xl p-4 text-left text-lg font-semibold text-white border border-white/10"
                style={{ background: `linear-gradient(135deg, hsl(${(i * 23 + 205) % 360} 62% 34%), hsl(${(i * 23 + 235) % 360} 55% 14%))` }}
              >
                {g}
              </button>
            ))}
          </div>
        </section>
      )}

      {top && query.trim() && (
        <div className="grid grid-cols-1 2xl:grid-cols-[22rem_minmax(0,1fr)] gap-6">
          <section>
            <h2 className="text-xl font-semibold text-zs-text mb-3">{t('search.top')}</h2>
            <div className="glass lift group relative p-5 cursor-pointer max-w-md" onClick={() => playContext({ tracks: results, index: 0 })}>
              <Cover src={top.thumbnail} size={240} className="w-24 h-24 mb-4" rounded="rounded-xl" />
              <div className="text-2xl font-semibold text-zs-text truncate">{top.title}</div>
              <div className="text-sm text-zs-muted truncate mt-1">{top.artist}{top.album ? ` · ${top.album}` : ''}</div>
              <span className="btn-primary absolute right-5 bottom-5 w-12 h-12 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all">
                <Play className="w-5 h-5 ml-0.5" fill="currentColor" />
              </span>
            </div>
          </section>
          <section className="min-w-0">
            <h2 className="text-xl font-semibold text-zs-text mb-3">{t('search.songs')}</h2>
            <TrackList tracks={results} showAlbum={false} />
          </section>
        </div>
      )}

      {!busy && query.trim() && results.length === 0 && (
        <p className="text-sm text-zs-muted py-12 text-center">{t('search.none', { q: query })}</p>
      )}
    </div>
  )
}
