import { app, BrowserWindow, ipcMain, shell, nativeTheme, protocol, net, Tray, Menu, nativeImage } from 'electron'
import path from 'path'
import fs from 'fs'
import { autoUpdater } from 'electron-updater'
import * as ytm from './ytmusic'
import { resolve, initEngine } from './zsengine'
import { pick, describe, type Quality } from './zsquality'
import * as zsbuf from './zsbuffer'
import { initState, getItem, setItem, flushState, savedSettings } from './state'
import { importLink } from './importer'
import { syncedLyrics } from './lrclib'
import { setActivity, discordAvailable, type Playing } from './discord'

nativeTheme.themeSource = 'dark'

// One Zsound at a time: a second launch just brings the running one back.
if (!app.requestSingleInstanceLock()) app.exit(0)

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
let miniWindow: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false
let lang = 'fr'
let nowPlaying: Playing | null = null

const webPreferences = {
  preload: path.join(__dirname, 'preload.js'),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  webSecurity: true,
  spellcheck: false,
  autoplayPolicy: 'no-user-gesture-required' as const,
  v8CacheOptions: 'bypassHeatCheck' as const,
}

function loadRenderer(win: BrowserWindow, hash = '') {
  if (process.env.VITE_DEV_SERVER_URL) win.loadURL(`${process.env.VITE_DEV_SERVER_URL}${hash ? `#${hash}` : ''}`)
  else win.loadFile(path.join(__dirname, '../dist/index.html'), hash ? { hash } : undefined)
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e) => e.preventDefault())
}

const iconPath = () => (app.isPackaged ? path.join(process.resourcesPath, 'icon.png') : path.join(__dirname, '../build/icon.png'))

function showMain() {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 620,
    frame: false,
    backgroundColor: '#05070d',
    icon: iconPath(),
    webPreferences,
    show: false,
  })
  mainWindow.once('ready-to-show', () => mainWindow?.show())
  // Closing hides to the tray (music keeps playing) unless turned off in Settings.
  mainWindow.on('close', (e) => {
    if (quitting || savedSettings().closeToTray === false) return
    e.preventDefault()
    mainWindow?.hide()
  })
  mainWindow.on('closed', () => { mainWindow = null })
  loadRenderer(mainWindow)
}

function toggleMini() {
  if (miniWindow) return miniWindow.close()
  miniWindow = new BrowserWindow({
    width: 380,
    height: 96,
    resizable: false,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#0b1020',
    icon: iconPath(),
    webPreferences,
  })
  miniWindow.on('closed', () => { miniWindow = null })
  miniWindow.webContents.once('did-finish-load', () => miniWindow?.webContents.send('np:state', nowPlaying))
  loadRenderer(miniWindow, 'mini')
}

const label = (fr: string, en: string) => (lang === 'fr' ? fr : en)

function updateTray() {
  if (!tray) return
  tray.setToolTip(nowPlaying ? `${nowPlaying.title} · ${nowPlaying.artist}`.slice(0, 120) : 'Zsound')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: nowPlaying ? `${nowPlaying.title} · ${nowPlaying.artist}`.slice(0, 60) : 'Zsound', enabled: false },
    { type: 'separator' },
    { label: nowPlaying?.playing ? label('Pause', 'Pause') : label('Lecture', 'Play'), click: () => sendCommand('toggle') },
    { label: label('Suivant', 'Next'), click: () => sendCommand('next') },
    { label: label('Précédent', 'Previous'), click: () => sendCommand('previous') },
    { type: 'separator' },
    { label: label('Afficher Zsound', 'Show Zsound'), click: showMain },
    { label: label('Mini-lecteur', 'Mini player'), click: toggleMini },
    { type: 'separator' },
    { label: label('Quitter', 'Quit'), click: () => { quitting = true; app.quit() } },
  ]))
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(iconPath()).resize({ width: 16, height: 16 }))
  tray.on('click', showMain)
  updateTray()
}

function sendCommand(cmd: string) {
  mainWindow?.webContents.send('player:command', cmd)
}

const QUALITIES: Quality[] = ['low', 'normal', 'high', 'zs']
const asQuality = (q: unknown): Quality => (QUALITIES.includes(q as Quality) ? (q as Quality) : 'zs')
const asId = (id: unknown): string => {
  if (typeof id !== 'string' || !/^[\w-]{11}$/.test(id)) throw new Error('bad video id')
  return id
}
const str = (v: unknown, max = 300) => (typeof v === 'string' ? v.slice(0, max) : '')

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

// Average colour of a cover, from a 16 px copy, for the dynamic background tint.
async function coverColor(url: string): Promise<[number, number, number] | null> {
  if (new URL(url).protocol !== 'https:') return null
  const small = url.replace(/=w\d+-h\d+/, '=w16-h16')
  const img = nativeImage.createFromBuffer(Buffer.from(await (await net.fetch(small)).arrayBuffer()))
  if (img.isEmpty()) return null
  const px = img.resize({ width: 8, height: 8 }).toBitmap()
  let r = 0, g = 0, b = 0, n = 0
  for (let i = 0; i < px.length; i += 4) { b += px[i]; g += px[i + 1]; r += px[i + 2]; n++ }
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)]
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

initState(app.getPath('userData'))

app.whenReady().then(() => {
  lang = app.getLocale().startsWith('fr') ? 'fr' : 'en'
  ytm.setLocale(app.getLocale().split('-')[0] || 'en', app.getLocaleCountryCode() || 'US')
  protocol.handle('zsa', (req) => handleAudio(req).catch((e) => new Response(String(e.message), { status: 500 })))
  const resources = app.isPackaged ? process.resourcesPath : path.join(app.getAppPath(), 'resources')
  initEngine({ userData: app.getPath('userData'), bundledYtdlp: path.join(resources, 'bin', 'ytdlp', 'yt-dlp.exe') })
  createWindow()
  createTray()
  if (app.isPackaged) setupUpdater()
})

app.on('second-instance', showMain)
app.on('before-quit', () => {
  quitting = true
  flushState()
  setActivity(null, false)
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.on('window:minimize', (e) => BrowserWindow.fromWebContents(e.sender)?.minimize())
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
ipcMain.on('window:close', (e) => BrowserWindow.fromWebContents(e.sender)?.close())

// Persistent state (sync get at startup, async set).
ipcMain.on('store:get', (e, key) => { e.returnValue = getItem(str(key, 100)) })
ipcMain.on('store:set', (_e, key, value) => setItem(str(key, 100), typeof value === 'string' ? value : null))

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
  quitting = true
  flushState()
  app.relaunch()
  app.exit(0)
})
ipcMain.on('app:lang', (_e, l) => {
  if (l !== 'fr' && l !== 'en') return
  lang = l
  ytm.setLocale(l, ytm.locale().gl)
  updateTray()
})
ipcMain.handle('update:check', () => (app.isPackaged ? autoUpdater.checkForUpdates().then(() => true).catch(() => false) : false))
ipcMain.handle('update:download', () => autoUpdater.downloadUpdate().then(() => true).catch(() => false))
ipcMain.on('update:install', () => { quitting = true; flushState(); autoUpdater.quitAndInstall(false, true) })

// Now playing: renderer → tray, mini player, Discord. Commands: tray / mini player → renderer.
ipcMain.on('np:update', (_e, np) => {
  nowPlaying = np && typeof np.title === 'string' ? np : null
  updateTray()
  miniWindow?.webContents.send('np:state', nowPlaying)
  setActivity(nowPlaying, savedSettings().discord === true)
})
ipcMain.on('player:command', (_e, cmd) => {
  if (cmd === 'toggle' || cmd === 'next' || cmd === 'previous') sendCommand(cmd)
})
ipcMain.on('mini:toggle', toggleMini)
ipcMain.handle('discord:available', () => discordAvailable())

ipcMain.handle('ytm:search', (_e, q) => ytm.search(str(q)))
ipcMain.handle('ytm:suggestions', (_e, q) => ytm.suggestions(str(q)).catch(() => []))
ipcMain.handle('ytm:radio', (_e, id, playlistId) => ytm.radio(asId(id), /^[\w-]{2,80}$/.test(playlistId ?? '') ? playlistId : undefined))
ipcMain.handle('ytm:lyrics', (_e, id) => ytm.lyrics(asId(id)).catch(() => null))
ipcMain.handle('ytm:synced', (_e, id, t) => syncedLyrics(asId(id), { title: str(t?.title), artist: str(t?.artist), duration: Number(t?.duration) || 0 }))
ipcMain.handle('ytm:home', () => ytm.home())
ipcMain.handle('ytm:collection', (_e, id, full) => ytm.collection(str(id), full === true ? 9 : 0))
ipcMain.handle('ytm:artist', (_e, id) => {
  if (!/^UC[\w-]{10,40}$/.test(str(id))) throw new Error('bad artist id')
  return ytm.artist(id)
})
ipcMain.handle('import:link', async (e, url) => {
  const res = await importLink(str(url, 500), (done, total) => e.sender.send('import:progress', { done, total }))
  return { name: res.name, tracks: res.tracks, missed: res.missed.length }
})
ipcMain.handle('cover:color', (_e, url) => coverColor(str(url, 500)).catch(() => null))

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
