// Self-check for the recommendation algorithm, import matching and LRC parsing: pnpm check:algo
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import path from 'node:path'

// Source files import siblings without extensions (Vite style); let Node find the .ts.
registerHooks({
  resolve(spec, ctx, next) {
    if (/^\.\.?\//.test(spec) && !path.extname(spec)) {
      try { return next(`${spec}.ts`, ctx) } catch { /* fall through */ }
    }
    return next(spec, ctx)
  },
})

const { buildMix, trackKey, primaryArtist } = await import('../src/audio/algo.ts')
const { score, parseLink } = await import('../electron/importer.ts')
const { parseLrc } = await import('../electron/lrclib.ts')

const t = (id: string, title: string, artist: string, duration = 180) => ({ id, title, artist, album: '', duration, thumbnail: '' })
const empty = { likedArtists: new Set<string>(), knownArtists: new Set<string>(), recentIds: new Set<string>(), skippedTracks: {}, skippedArtists: {} }

const seed = t('seed0000000', 'Fille à Papa', 'Vacra')
const radio = [
  t('a1', 'Song A', 'Vacra'), t('a2', 'Song B', 'Vacra'), t('a3', 'Song C', 'Vacra'), t('a4', 'Song D', 'Vacra'),
  t('b1', 'Track 1', 'Oria'), t('b2', 'Track 1 (Slowed)', 'Oria'), t('c1', 'Other', 'ESTL'), t('d1', 'Dup', 'Niska'),
  t('d2', 'Dup (Official Audio)', 'Niska'), t('e1', 'Fille à Papa (Sped Up)', 'Vacra'), t('f1', 'New', 'Unknown Artist'),
]

// Variants and duplicate versions are removed, the seed itself never comes back.
const mix = buildMix(seed, [radio], empty, 'balanced')
assert.ok(!mix.some((x) => /slowed|sped up/i.test(x.title)))
assert.equal(mix.filter((x) => trackKey(x) === trackKey(t('', 'Dup', 'Niska'))).length, 1)
assert.ok(!mix.some((x) => x.id === seed.id))

// The seed artist is capped per mode, and never twice in a row while others are available.
const count = (m: typeof mix) => m.filter((x) => primaryArtist(x) === 'vacra').length
assert.equal(count(buildMix(seed, [radio], empty, 'discover')), 1)
assert.equal(count(buildMix(seed, [radio], empty, 'balanced')), 2)
assert.equal(count(buildMix(seed, [radio], empty, 'style')), 3)
const bal = buildMix(seed, [radio], empty, 'balanced')
for (let i = 1; i < bal.length; i++) {
  if (primaryArtist(bal[i]) === primaryArtist(bal[i - 1])) assert.fail(`same artist twice in a row: ${bal[i].artist}`)
}

// Recently played and twice-skipped tracks are excluded.
const profile = { ...empty, recentIds: new Set(['c1']), skippedTracks: { b1: 2 }, skippedArtists: {} }
const filtered = buildMix(seed, [radio], profile, 'balanced')
assert.ok(!filtered.some((x) => x.id === 'c1' || x.id === 'b1'))

// Discover favours artists the listener has never played; style favours liked artists.
const known = { ...empty, knownArtists: new Set(['oria', 'estl', 'niska', 'vacra']) }
assert.equal(buildMix(seed, [radio], known, 'discover')[0].id, 'f1')
const liked = { ...empty, likedArtists: new Set(['estl']), knownArtists: new Set(['estl']) }
assert.equal(buildMix(seed, [radio], liked, 'style')[0].id, 'c1')

// A track two radios agree on beats one only the second radio has.
const second = [t('f1', 'New', 'Unknown Artist'), t('g1', 'Only here', 'Solo')]
const blended = buildMix(seed, [radio, second], known, 'balanced')
assert.ok(blended.findIndex((x) => x.id === 'f1') < blended.findIndex((x) => x.id === 'g1'))

// Import matching: right title + artist + duration wins over a cover.
const item = { title: 'Housewife', artist: 'Tate McRae', duration: 209 }
assert.ok(score(item, t('x', 'Housewife', 'Tate McRae', 210)) > score(item, t('y', 'Housewife (Cover)', 'Some Singer', 250)))
assert.ok(score(item, t('x', 'Housewife', 'Tate McRae', 210)) >= 2)
assert.deepEqual(parseLink('https://open.spotify.com/intl-fr/playlist/37i9dQZF1DXcBWIGoYBM5M?si=1'), { service: 'spotify', kind: 'playlist', id: '37i9dQZF1DXcBWIGoYBM5M' })
assert.deepEqual(parseLink('https://www.deezer.com/fr/playlist/1109890291'), { service: 'deezer', kind: 'playlist', id: '1109890291' })
assert.deepEqual(parseLink('https://music.youtube.com/playlist?list=RDCLAK5uy_x'), { service: 'youtube', id: 'VLRDCLAK5uy_x' })
assert.equal(parseLink('https://evil.example/playlist/1'), null)

// LRC: multiple timestamps per line, sorted.
assert.deepEqual(parseLrc('[00:24.09] Last night\n[00:10.00][01:00.50] Hook\n[ar:Daft Punk]'), [
  { time: 10, text: 'Hook' }, { time: 24.09, text: 'Last night' }, { time: 60.5, text: 'Hook' },
])

console.log('ZS algo OK')
