// Live smoke test for electron/ytmusic.ts: pnpm check:api
import assert from 'node:assert/strict'
import * as ytm from '../electron/ytmusic.ts'

async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t = performance.now()
  const v = await fn()
  console.log(`${label.padEnd(12)} ${Math.round(performance.now() - t)} ms`)
  return v
}

assert.equal(ytm.parseDuration('3:32'), 212)
assert.equal(ytm.parseDuration('1:02:03'), 3723)
assert.equal(ytm.parseDuration('9M plays'), 0)

const results = await timed('search', () => ytm.search('avie 0.9'))
assert.ok(results.length > 5, 'search returns songs')
const first = results[0]
assert.match(first.id, /^[\w-]{11}$/)
assert.ok(first.title && first.artist !== 'Unknown' && first.duration > 0 && first.thumbnail.startsWith('http'))
console.log('  ->', first.title, '|', first.artist, '|', first.album, '|', first.duration, 's')
await timed('search warm', () => ytm.search('avie 0.9'))

const sugg = await timed('suggestions', () => ytm.suggestions('drak'))
assert.ok(sugg.length > 0)

const rad = await timed('radio', () => ytm.radio(first.id))
assert.ok(rad.length > 10 && rad.every((t) => t.id !== first.id))
console.log('  ->', rad.slice(0, 3).map((t) => `${t.title} - ${t.artist}`).join(' | '))

const lyr = await timed('lyrics', () => ytm.lyrics('dQw4w9WgXcQ'))
assert.ok(lyr?.includes('strangers'))

const shelves = await timed('home', () => ytm.home())
assert.ok(shelves.length >= 3)
console.log('  ->', shelves.map((s) => `${s.title} (${s.tracks.length}t/${s.collections.length}c)`).join(' | '))

const colId = shelves.flatMap((s) => s.collections)[0]?.id
assert.ok(colId)
const page = await timed('collection', () => ytm.collection(colId))
assert.ok(page.title && page.tracks.length > 0)
console.log('  ->', page.title, '|', page.subtitle, '|', page.tracks.length, 'tracks')

if (first.albumId) {
  const album = await timed('album', () => ytm.collection(first.albumId!))
  assert.ok(album.tracks.length > 0 && album.tracks[0].artist !== 'Unknown')
}
const artistPage = await timed('artist', () => ytm.artist('UCAsCxvWP4tEy25BxuruK87Q'))
assert.ok(artistPage.name && artistPage.topSongs.length > 0 && artistPage.shelves.length > 0)
assert.ok(artistPage.topSongs.every((t) => t.artistId))
console.log('  ->', artistPage.name, '|', artistPage.subtitle, '|', artistPage.topSongs.length, 'top |', artistPage.shelves.map((s) => s.title).join(', '))
assert.ok(results.some((t) => t.artistId?.startsWith('UC')), 'search results carry artist ids')

const long = await timed('long list', () => ytm.collection('VLRDCLAK5uy_lMzHW51iFg1Kx0d_2EHpzbOgCrwtu8cgI'))
assert.ok(long.tracks.length > 101, `paging past the first page (${long.tracks.length})`)
console.log('  ->', long.tracks.length, 'tracks')

// Sibling imports are extensionless (Vite style): let Node find the .ts for the modules below.
const { registerHooks } = await import('node:module')
registerHooks({
  resolve(spec, ctx, next) {
    if (/^\.\.?\//.test(spec) && !/\.\w+$/.test(spec)) {
      try { return next(`${spec}.ts`, ctx) } catch { /* fall through */ }
    }
    return next(spec, ctx)
  },
})
const { importLink } = await import('../electron/importer.ts')
const imported = await timed('import', () => importLink('https://open.spotify.com/album/4m2880jivSbbyEGAKfITCa', () => {}))
assert.ok(imported.tracks.length >= 10, `spotify album matched (${imported.tracks.length}/13)`)
console.log('  ->', imported.name, '|', imported.tracks.length, 'matched,', imported.missed.length, 'missed')

const { syncedLyrics } = await import('../electron/lrclib.ts')
const synced = await timed('lrclib', () => syncedLyrics('dQw4w9WgXcQ', { title: 'Never Gonna Give You Up', artist: 'Rick Astley', duration: 213 }))
assert.ok(synced && synced.length > 10)

console.log('API OK')
