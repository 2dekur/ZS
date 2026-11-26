export interface Track {
  id: string
  title: string
  artist: string
  artistId?: string
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

export interface ArtistPage {
  id: string
  name: string
  subtitle: string
  thumbnail: string
  radio: { videoId: string; playlistId: string } | null
  topSongs: Track[]
  topSongsPlaylist?: string
  shelves: Shelf[]
}

export interface Playlist {
  id: string
  name: string
  tracks: Track[]
  createdAt: number
}

export interface LyricLine { time: number; text: string }

export type Quality = 'low' | 'normal' | 'high' | 'zs'
export type RepeatMode = 'off' | 'all' | 'one'
export type AlgoMode = 'style' | 'balanced' | 'discover'

export interface StreamMeta {
  quality: Quality
  codec: string
  kbps: number
  sampleRate: number
  loudnessDb: number | null
  engine: 'zs' | 'fallback'
  itag: number
}

export type UpdateState =
  | { status: 'idle' | 'checking' | 'latest' }
  | { status: 'available'; version: string; notes: string }
  | { status: 'downloading'; percent: number }
  | { status: 'ready'; version: string }
  | { status: 'error'; message: string }

export interface Settings {
  quality: Quality
  normalize: boolean
  eqEnabled: boolean
  eq: number[]
  autoplay: boolean
  zsLoudness?: boolean
  algoMode?: AlgoMode
  crossfade?: number
  closeToTray?: boolean
  dynamicColor?: boolean
  discord?: boolean
}

export interface NowPlaying { title: string; artist: string; thumbnail: string; playing: boolean; duration: number; position: number }
export type RemoteCommand = 'toggle' | 'next' | 'previous'

export type View =
  | { kind: 'home' }
  | { kind: 'search' }
  | { kind: 'library' }
  | { kind: 'liked' }
  | { kind: 'settings' }
  | { kind: 'playlist'; id: string }
  | { kind: 'collection'; id: string }
  | { kind: 'artist'; id: string }

declare global {
  interface Window {
    zsound: {
      search: (q: string) => Promise<Track[]>
      suggestions: (q: string) => Promise<string[]>
      radio: (id: string, playlistId?: string) => Promise<Track[]>
      lyrics: (id: string) => Promise<string | null>
      syncedLyrics: (id: string, t: { title: string; artist: string; duration: number }) => Promise<LyricLine[] | null>
      home: () => Promise<Shelf[]>
      collection: (id: string, full?: boolean) => Promise<CollectionPage>
      artist: (id: string) => Promise<ArtistPage>
      importLink: (url: string) => Promise<{ name: string; tracks: Track[]; missed: number }>
      onImportProgress: (cb: (p: { done: number; total: number }) => void) => () => void
      coverColor: (url: string) => Promise<[number, number, number] | null>
      prefetch: (id: string) => void
      preload: (id: string) => void
      bufferStats: () => Promise<{ tracks: number; mb: number }>
      streamInfo: (id: string, q: Quality) => Promise<StreamMeta | null>
      storeGet: (key: string) => string | null
      storeSet: (key: string, value: string | null) => void
      nowPlaying: (np: NowPlaying | null) => void
      onNowPlaying: (cb: (np: NowPlaying | null) => void) => () => void
      sendCommand: (cmd: RemoteCommand) => void
      onCommand: (cb: (cmd: RemoteCommand) => void) => () => void
      toggleMini: () => void
      discordAvailable: () => Promise<boolean>
      appInfo: () => Promise<{ version: string; packaged: boolean; hardwareAcceleration: boolean; hardwareAccelerationPref: boolean }>
      setHardwareAcceleration: (on: boolean) => Promise<boolean>
      relaunch: () => void
      setLang: (lang: string) => void
      checkUpdate: () => Promise<boolean>
      downloadUpdate: () => Promise<boolean>
      installUpdate: () => void
      onUpdate: (cb: (state: UpdateState) => void) => () => void
      minimize: () => void
      maximize: () => void
      close: () => void
    }
  }
}
