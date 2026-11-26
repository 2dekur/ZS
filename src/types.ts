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

export interface Playlist {
  id: string
  name: string
  tracks: Track[]
  createdAt: number
}

export type Quality = 'low' | 'normal' | 'high' | 'zs'
export type RepeatMode = 'off' | 'all' | 'one'

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
}

export type View =
  | { kind: 'home' }
  | { kind: 'search' }
  | { kind: 'library' }
  | { kind: 'liked' }
  | { kind: 'settings' }
  | { kind: 'playlist'; id: string }
  | { kind: 'collection'; id: string }

declare global {
  interface Window {
    zsound: {
      search: (q: string) => Promise<Track[]>
      suggestions: (q: string) => Promise<string[]>
      radio: (id: string) => Promise<Track[]>
      lyrics: (id: string) => Promise<string | null>
      home: () => Promise<Shelf[]>
      collection: (id: string) => Promise<CollectionPage>
      prefetch: (id: string) => void
      preload: (id: string) => void
      bufferStats: () => Promise<{ tracks: number; mb: number }>
      streamInfo: (id: string, q: Quality) => Promise<StreamMeta | null>
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
