import { app, BrowserWindow, ipcMain, shell, nativeTheme, protocol, net } from 'electron'
import path from 'path'
import fs from 'fs'
import { autoUpdater } from 'electron-updater'
import * as ytm from './ytmusic'
import { resolve, initEngine } from './zsengine'
import { pick, describe, type Quality } from './zsquality'
import * as zsbuf from './zsbuffer'

nativeTheme.themeSource = 'dark'

// Read before app ready: hardware acceleration can only be switched at launch.
const prefsFile = path.join(app.getPath('userData'), 'prefs.json')
function readPrefs(): { hardwareAcceleration: boolean } {
  try { return { hardwareAcceleration: true, ...JSON.parse(fs.readFileSync(prefsFile, 'utf8')) } } catch { return { hardwareAcceleration: true } }
}
const launchPrefs = readPrefs()
if (!launchPrefs.hardwareAcceleration) app.disableHardwareAcceleration()

protocol.registerSchemesAsPrivileged([
  { scheme: 'zsa', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, corsEnabled: true } },
])

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 620,
    frame: false,
    backgroundColor: '#05070d',
    icon: app.isPackaged ? undefined : path.join(__dirname, '../build/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      autoplayPolicy: 'no-user-gesture-required',
      v8CacheOptions: 'bypassHeatCheck',
    },
    show: false,
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  if (process.env.VITE_DEV_SERVER_URL) mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  else mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (e) => e.preventDefault())
}

const QUALITIES: Quality[] = ['low', 'normal', 'high', 'zs']
const asQuality = (q: unknown): Quality => (QUALITIES.includes(q as Quality) ? (q as Quality) : 'zs')
const asId = (id: unknown): string => {
  if (typeof id !== 'string' || !/^[\w-]{11}$/.test(id)) throw new Error('bad video id')
  return id
}

let lastQuality: Quality = 'zs'

async function bufferStream(id: string, whole: boolean) {
  const r = await resolve(id)
  const f = r && pick(r, lastQuality)
  if (f) (whole ? zsbuf.fill : zsbuf.warm)(`${id}:${f.itag}`, f)
}

// zsa://stream/<videoId>?q=<quality>: serves the audio from ZS Buffer (RAM) when it can, else proxies it,
// so the renderer can run it through Web Audio.
async function handleAudio(req: Request): Promise<Response> {
  const u = new URL(req.url)
  const id = asId(u.pathname.replace(/^\//, ''))
  const q = asQuality(u.searchParams.get('q'))
  lastQuality = q
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await resolve(id, { force: attempt > 0 })
    const f = r && pick(r, q)
    if (!f) return new Response('stream unavailable', { status: 502 })
    if (attempt === 0) {
      const key = `${id}:${f.itag}`
      zsbuf.fill(key, f)
      const fromMemory = zsbuf.serve(key, f, req.headers.get('range'))
      if (fromMemory) return fromMemory
    }
    const headers = new Headers(f.headers)
    const range = req.headers.get('range')
    if (range) headers.set('Range', range)
    const res = await net.fetch(f.url, { headers })
    if ((res.status === 403 || res.status === 410) && attempt === 0) continue
    const out = new Headers({ 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' })
    for (const k of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
      const v = res.headers.get(k)
      if (v) out.set(k, v)
    }
    return new Response(res.body, { status: res.status, headers: out })
  }
  return new Response('stream expired', { status: 502 })
}

// --- updates: check only, the user decides to download ---
function htmlToText(notes: unknown): string {
  const raw = Array.isArray(notes) ? notes.map((n: any) => n?.note ?? '').join('\n') : String(notes ?? '')
  return raw
    .replace(/<\s*(br|\/p|\/li|\/h\d)\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 2000)
}

function sendUpdate(state: object) {
  mainWindow?.webContents.send('update:state', state)
}

function setupUpdater() {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('checking-for-update', () => sendUpdate({ status: 'checking' }))
  autoUpdater.on('update-available', (info) => sendUpdate({ status: 'available', version: info.version, notes: htmlToText(info.releaseNotes) }))
  autoUpdater.on('update-not-available', () => sendUpdate({ status: 'latest' }))
  autoUpdater.on('download-progress', (p) => sendUpdate({ status: 'downloading', percent: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', (info) => sendUpdate({ status: 'ready', version: info.version }))
  autoUpdater.on('error', (e) => {
    const message = String(e?.message ?? e).split('\n')[0].slice(0, 200)
    // No release published yet means nothing newer exists.
    if (/No published versions|latest\.yml|404/i.test(message)) sendUpdate({ status: 'latest' })
    else sendUpdate({ status: 'error', message })
  })
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 4000)
}

app.whenReady().then(() => {
  ytm.setLocale(app.getLocale().split('-')[0] || 'en', app.getLocaleCountryCode() || 'US')
  protocol.handle('zsa', (req) => handleAudio(req).catch((e) => new Response(String(e.message), { status: 500 })))
  const resources = app.isPackaged ? process.resourcesPath : path.join(app.getAppPath(), 'resources')
  initEngine({ userData: app.getPath('userData'), bundledYtdlp: path.join(resources, 'bin', 'ytdlp', 'yt-dlp.exe') })
  createWindow()
  if (app.isPackaged) setupUpdater()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.on('window:minimize', () => mainWindow?.minimize())
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
ipcMain.on('window:close', () => mainWindow?.close())

const str = (v: unknown) => (typeof v === 'string' ? v.slice(0, 300) : '')

ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  packaged: app.isPackaged,
  hardwareAcceleration: launchPrefs.hardwareAcceleration,
  hardwareAccelerationPref: readPrefs().hardwareAcceleration,
}))
ipcMain.handle('app:set-hwaccel', (_e, on) => {
  fs.mkdirSync(path.dirname(prefsFile), { recursive: true })
  fs.writeFileSync(prefsFile, JSON.stringify({ ...readPrefs(), hardwareAcceleration: on === true }))
  return on === true
})
ipcMain.on('app:relaunch', () => {
  app.relaunch()
  app.exit(0)
})
ipcMain.on('app:lang', (_e, lang) => {
  if (lang === 'fr' || lang === 'en') ytm.setLocale(lang, ytm.locale().gl)
})
ipcMain.handle('update:check', () => (app.isPackaged ? autoUpdater.checkForUpdates().then(() => true).catch(() => false) : false))
ipcMain.handle('update:download', () => autoUpdater.downloadUpdate().then(() => true).catch(() => false))
ipcMain.on('update:install', () => autoUpdater.quitAndInstall(false, true))

ipcMain.handle('ytm:search', (_e, q) => ytm.search(str(q)))
ipcMain.handle('ytm:suggestions', (_e, q) => ytm.suggestions(str(q)).catch(() => []))
ipcMain.handle('ytm:radio', (_e, id) => ytm.radio(asId(id)))
ipcMain.handle('ytm:lyrics', (_e, id) => ytm.lyrics(asId(id)).catch(() => null))
ipcMain.handle('ytm:home', () => ytm.home())
ipcMain.handle('ytm:collection', (_e, id) => ytm.collection(str(id)))
ipcMain.on('stream:prefetch', (_e, id) => {
  try { bufferStream(asId(id), false).catch(() => {}) } catch { /* ignore bad ids */ }
})
ipcMain.on('stream:preload', (_e, id) => {
  try { bufferStream(asId(id), true).catch(() => {}) } catch { /* ignore bad ids */ }
})
ipcMain.handle('stream:stats', () => zsbuf.stats())
ipcMain.handle('stream:info', async (_e, id, q) => {
  const quality = asQuality(q)
  const r = await resolve(asId(id))
  const f = r && pick(r, quality)
  return r && f ? describe(r, f, quality) : null
})
