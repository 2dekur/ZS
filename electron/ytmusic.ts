// Zsound's own YouTube Music client (InnerTube). Runs on each user's machine:
// no server, no API key, no shared quota.

export interface Track {
  id: string
  title: string
  artist: string
  album: string
  albumId?: string
  duration: number
  thumbnail: string
}

export interface Collection {
  id: string
  title: string
  subtitle: string
  thumbnail: string
}

export interface Shelf {
  title: string
  tracks: Track[]
  collections: Collection[]
}

export interface CollectionPage extends Collection {
  tracks: Track[]
}

const BASE = 'https://music.youtube.com/youtubei/v1/'
const SONGS_ONLY = 'EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D'
const client = { clientName: 'WEB_REMIX', clientVersion: '1.20260707.12.00', hl: 'en', gl: 'US' }
let visitorData: string | null = null

export function setLocale(hl: string, gl: string) {
  client.hl = hl
  client.gl = gl
}

export function locale() {
  return { hl: client.hl, gl: client.gl }
}

// YouTube's anonymous session id: the ZS Engine needs it to pass the bot check.
export async function ensureVisitor(): Promise<string | null> {
  if (!visitorData) await call('music/get_search_suggestions', { input: 'a' }).catch(() => null)
  return visitorData
}

export async function refreshVisitor(): Promise<string | null> {
  visitorData = null
  return ensureVisitor()
}

async function call(endpoint: string, body: object, query = ''): Promise<any> {
  const res = await fetch(`${BASE}${endpoint}?prettyPrint=false${query}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://music.youtube.com',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
    },
    body: JSON.stringify({ context: { client }, ...body }),
  })
  if (!res.ok) throw new Error(`InnerTube ${endpoint} HTTP ${res.status}`)
  const j: any = await res.json()
  if (j?.responseContext?.visitorData) visitorData = j.responseContext.visitorData
  return j
}

function cached<T>(ttlMs: number, max = 300) {
  const map = new Map<string, { v: T; at: number }>()
  return async (key: string, load: () => Promise<T>): Promise<T> => {
    const hit = map.get(key)
    if (hit && Date.now() - hit.at < ttlMs) return hit.v
    const v = await load()
    if (map.size >= max) map.delete(map.keys().next().value as string)
    map.set(key, { v, at: Date.now() })
    return v
  }
}

const runs = (t: any): any[] => t?.runs ?? []
const text = (t: any): string => runs(t).map((r) => r.text).join('')
const pageType = (r: any): string | undefined =>
  r?.navigationEndpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType
const browseId = (r: any): string | undefined => r?.navigationEndpoint?.browseEndpoint?.browseId
const DURATION = /^\d+(:\d{2}){1,2}$/
const isSeparator = (s: string) => ['•', '&', ',', ''].includes(s.trim())

export function parseDuration(s: string | undefined): number {
  if (!s || !DURATION.test(s)) return 0
  return s.split(':').reduce((acc, p) => acc * 60 + Number(p), 0)
}

export function hiRes(thumbs: any[] | undefined): string {
  const url: string = thumbs?.at(-1)?.url ?? ''
  return url.replace(/=w\d+-h\d+/, '=w544-h544')
}

interface Fallback { thumbnail?: string; artist?: string; album?: string; albumId?: string }

function parseListItem(it: any, fb: Fallback = {}): Track | null {
  const id = it?.playlistItemData?.videoId
    ?? it?.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId
  if (!id) return null
  const cols: any[] = (it.flexColumns ?? []).map((c: any) => c.musicResponsiveListItemFlexColumnRenderer?.text)
  const meta: any[] = cols.slice(1).flatMap(runs)
  const fixed = runs(it.fixedColumns?.[0]?.musicResponsiveListItemFixedColumnRenderer?.text)
  const artists = meta.filter((r) => pageType(r) === 'MUSIC_PAGE_TYPE_ARTIST').map((r) => r.text)
  const firstMeta = runs(cols[1]).find((r) => !isSeparator(r.text) && !DURATION.test(r.text))?.text
  const albumRun = meta.find((r) => pageType(r) === 'MUSIC_PAGE_TYPE_ALBUM')
  const dur = [...meta, ...fixed].map((r) => r.text).find((t) => DURATION.test(t))
  return {
    id,
    title: text(cols[0]) || 'Unknown',
    artist: artists.length ? artists.join(', ') : firstMeta ?? fb.artist ?? 'Unknown',
    album: albumRun?.text ?? fb.album ?? '',
    albumId: browseId(albumRun) ?? fb.albumId,
    duration: parseDuration(dur),
    thumbnail: hiRes(it.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails) || fb.thumbnail || '',
  }
}

function parsePanelItem(v: any): Track | null {
  if (!v?.videoId) return null
  const by = runs(v.longBylineText)
  const artists = by.filter((r) => pageType(r) === 'MUSIC_PAGE_TYPE_ARTIST').map((r) => r.text)
  const albumRun = by.find((r) => pageType(r) === 'MUSIC_PAGE_TYPE_ALBUM')
  return {
    id: v.videoId,
    title: text(v.title) || 'Unknown',
    artist: artists.length ? artists.join(', ') : by[0]?.text ?? 'Unknown',
    album: albumRun?.text ?? '',
    albumId: browseId(albumRun),
    duration: parseDuration(text(v.lengthText)),
    thumbnail: hiRes(v.thumbnail?.thumbnails),
  }
}

const notNull = <T>(x: T | null): x is T => x !== null

const searchCache = cached<Track[]>(10 * 60_000)
export function search(query: string): Promise<Track[]> {
  const q = query.trim()
  if (!q) return Promise.resolve([])
  return searchCache(`${client.hl}:${client.gl}:${q.toLowerCase()}`, async () => {
    const j = await call('search', { query: q, params: SONGS_ONLY })
    const sections = j.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents ?? []
    return sections
      .flatMap((s: any) => s.musicShelfRenderer?.contents ?? [])
      .map((c: any) => parseListItem(c.musicResponsiveListItemRenderer))
      .filter(notNull)
  })
}

const suggestCache = cached<string[]>(30 * 60_000, 500)
export function suggestions(input: string): Promise<string[]> {
  const q = input.trim()
  if (!q) return Promise.resolve([])
  return suggestCache(q.toLowerCase(), async () => {
    const j = await call('music/get_search_suggestions', { input: q })
    return (j.contents?.[0]?.searchSuggestionsSectionRenderer?.contents ?? [])
      .map((c: any) => c.searchSuggestionRenderer?.navigationEndpoint?.searchEndpoint?.query)
      .filter(Boolean)
  })
}

const nextCache = cached<any>(10 * 60_000)
const watchNext = (videoId: string) =>
  nextCache(videoId, () => call('next', { videoId, playlistId: `RDAMVM${videoId}`, isAudioOnly: true }))
const nextTabs = (j: any): any[] =>
  j.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer?.watchNextTabbedResultsRenderer?.tabs ?? []

export async function radio(videoId: string): Promise<Track[]> {
  const j = await watchNext(videoId)
  const items = nextTabs(j)[0]?.tabRenderer?.content?.musicQueueRenderer?.content?.playlistPanelRenderer?.contents ?? []
  return items.map((c: any) => parsePanelItem(c.playlistPanelVideoRenderer)).filter(notNull).filter((t: Track) => t.id !== videoId)
}

const lyricsCache = cached<string | null>(60 * 60_000)
export function lyrics(videoId: string): Promise<string | null> {
  return lyricsCache(videoId, async () => {
    const tab = nextTabs(await watchNext(videoId)).find(
      (t) => pageType({ navigationEndpoint: t.tabRenderer?.endpoint }) === 'MUSIC_PAGE_TYPE_TRACK_LYRICS',
    )
    const id = tab?.tabRenderer?.endpoint?.browseEndpoint?.browseId
    if (!id) return null
    const j = await call('browse', { browseId: id })
    const shelf = j.contents?.sectionListRenderer?.contents?.[0]?.musicDescriptionShelfRenderer
    const body = text(shelf?.description)
    return body ? `${body}\n\n${text(shelf?.footer)}`.trim() : null
  })
}

function parseShelf(c: any): Shelf | null {
  const title = text(c?.header?.musicCarouselShelfBasicHeaderRenderer?.title)
  if (!title) return null
  const tracks: Track[] = []
  const collections: Collection[] = []
  for (const item of c.contents ?? []) {
    if (item.musicResponsiveListItemRenderer) {
      const t = parseListItem(item.musicResponsiveListItemRenderer)
      if (t) tracks.push(t)
      continue
    }
    const r = item.musicTwoRowItemRenderer
    if (!r) continue
    const thumbnail = hiRes(r.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails)
    const videoId = r.navigationEndpoint?.watchEndpoint?.videoId
    const sub = runs(r.subtitle)
    if (videoId) {
      const artists = sub.filter((x) => pageType(x) === 'MUSIC_PAGE_TYPE_ARTIST').map((x) => x.text)
      tracks.push({ id: videoId, title: text(r.title), artist: artists.join(', ') || text(r.subtitle), album: '', duration: 0, thumbnail })
      continue
    }
    const id = browseId(r)
    // shortcut: artist pages (UC…) are skipped, only playlists (VL…) and albums (MPRE…) open
    if (id && (id.startsWith('VL') || id.startsWith('MPRE'))) {
      collections.push({ id, title: text(r.title), subtitle: text(r.subtitle), thumbnail })
    }
  }
  return tracks.length || collections.length ? { title, tracks, collections } : null
}

const homeCache = cached<Shelf[]>(20 * 60_000, 4)
export function home(): Promise<Shelf[]> {
  return homeCache(`${client.hl}:${client.gl}`, async () => {
    const first = await call('browse', { browseId: 'FEmusic_home' })
    let section = first.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer
    const contents: any[] = [...(section?.contents ?? [])]
    for (let i = 0; i < 2; i++) {
      const token = section?.continuations?.[0]?.nextContinuationData?.continuation
      if (!token) break
      const more = await call('browse', {}, `&ctoken=${token}&continuation=${token}&type=next`).catch(() => null)
      section = more?.continuationContents?.sectionListContinuation
      contents.push(...(section?.contents ?? []))
    }
    return contents.map((c) => parseShelf(c.musicCarouselShelfRenderer)).filter(notNull)
  })
}

const collectionCache = cached<CollectionPage>(30 * 60_000, 100)
export function collection(id: string): Promise<CollectionPage> {
  return collectionCache(id, async () => {
    const j = await call('browse', { browseId: id })
    const two = j.contents?.twoColumnBrowseResultsRenderer
    const head = two?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]?.musicResponsiveHeaderRenderer
    const title = text(head?.title)
    const artist = text(head?.straplineTextOne)
    const thumbnail = hiRes(head?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails)
    const shelf = two?.secondaryContents?.sectionListRenderer?.contents?.[0]
    const items = (shelf?.musicShelfRenderer ?? shelf?.musicPlaylistShelfRenderer)?.contents ?? []
    const isAlbum = id.startsWith('MPRE')
    // shortcut: playlists load their first page (~100 tracks), add continuation paging if users need longer ones
    const tracks = items
      .map((c: any) => parseListItem(c.musicResponsiveListItemRenderer, {
        thumbnail, artist: artist || undefined, album: isAlbum ? title : undefined, albumId: isAlbum ? id : undefined,
      }))
      .filter(notNull)
    return { id, title, subtitle: [artist, text(head?.subtitle)].filter(Boolean).join(' • '), thumbnail, tracks }
  })
}
