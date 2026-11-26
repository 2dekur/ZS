import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('zsound', {
  search: (q: string) => ipcRenderer.invoke('ytm:search', q),
  suggestions: (q: string) => ipcRenderer.invoke('ytm:suggestions', q),
  radio: (id: string) => ipcRenderer.invoke('ytm:radio', id),
  lyrics: (id: string) => ipcRenderer.invoke('ytm:lyrics', id),
  home: () => ipcRenderer.invoke('ytm:home'),
  collection: (id: string) => ipcRenderer.invoke('ytm:collection', id),
  prefetch: (id: string) => ipcRenderer.send('stream:prefetch', id),
  preload: (id: string) => ipcRenderer.send('stream:preload', id),
  bufferStats: () => ipcRenderer.invoke('stream:stats'),
  streamInfo: (id: string, q: string) => ipcRenderer.invoke('stream:info', id, q),
  appInfo: () => ipcRenderer.invoke('app:info'),
  setHardwareAcceleration: (on: boolean) => ipcRenderer.invoke('app:set-hwaccel', on),
  relaunch: () => ipcRenderer.send('app:relaunch'),
  setLang: (lang: string) => ipcRenderer.send('app:lang', lang),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.send('update:install'),
  onUpdate: (cb: (state: unknown) => void) => {
    const listener = (_e: unknown, s: unknown) => cb(s)
    ipcRenderer.on('update:state', listener)
    return () => { ipcRenderer.removeListener('update:state', listener) }
  },
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
})
