import { contextBridge, ipcRenderer } from 'electron'

const on = (channel: string) => (cb: (data: unknown) => void) => {
  const listener = (_e: unknown, data: unknown) => cb(data)
  ipcRenderer.on(channel, listener)
  return () => { ipcRenderer.removeListener(channel, listener) }
}

contextBridge.exposeInMainWorld('zsound', {
  search: (q: string) => ipcRenderer.invoke('ytm:search', q),
  suggestions: (q: string) => ipcRenderer.invoke('ytm:suggestions', q),
  radio: (id: string, playlistId?: string) => ipcRenderer.invoke('ytm:radio', id, playlistId),
  lyrics: (id: string) => ipcRenderer.invoke('ytm:lyrics', id),
  syncedLyrics: (id: string, t: object) => ipcRenderer.invoke('ytm:synced', id, t),
  home: () => ipcRenderer.invoke('ytm:home'),
  collection: (id: string, full = false) => ipcRenderer.invoke('ytm:collection', id, full),
  artist: (id: string) => ipcRenderer.invoke('ytm:artist', id),
  importLink: (url: string) => ipcRenderer.invoke('import:link', url),
  onImportProgress: on('import:progress'),
  coverColor: (url: string) => ipcRenderer.invoke('cover:color', url),
  prefetch: (id: string) => ipcRenderer.send('stream:prefetch', id),
  preload: (id: string) => ipcRenderer.send('stream:preload', id),
  bufferStats: () => ipcRenderer.invoke('stream:stats'),
  streamInfo: (id: string, q: string) => ipcRenderer.invoke('stream:info', id, q),
  storeGet: (key: string) => ipcRenderer.sendSync('store:get', key),
  storeSet: (key: string, value: string | null) => ipcRenderer.send('store:set', key, value),
  nowPlaying: (np: object | null) => ipcRenderer.send('np:update', np),
  onNowPlaying: on('np:state'),
  sendCommand: (cmd: string) => ipcRenderer.send('player:command', cmd),
  onCommand: on('player:command'),
  toggleMini: () => ipcRenderer.send('mini:toggle'),
  discordAvailable: () => ipcRenderer.invoke('discord:available'),
  appInfo: () => ipcRenderer.invoke('app:info'),
  setHardwareAcceleration: (on: boolean) => ipcRenderer.invoke('app:set-hwaccel', on),
  relaunch: () => ipcRenderer.send('app:relaunch'),
  setLang: (lang: string) => ipcRenderer.send('app:lang', lang),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.send('update:install'),
  onUpdate: on('update:state'),
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
})
