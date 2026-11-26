// Last-resort fallback for the ZS Engine: the bundled yt-dlp, kept current by a background self-update.
import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import type { AudioFormat } from './zsengine'

let bundled = ''
let engineDir = ''
const stateFile = () => path.join(engineDir, 'state.json')

interface EngineState { version?: string; checkedAt?: number }
function readState(): EngineState {
  try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')) } catch { return {} }
}
function writeState(s: EngineState) {
  fs.mkdirSync(engineDir, { recursive: true })
  fs.writeFileSync(stateFile(), JSON.stringify(s))
}

function binary(): string {
  const { version } = readState()
  if (version) {
    const updated = path.join(engineDir, version, 'yt-dlp.exe')
    if (fs.existsSync(updated)) return updated
  }
  return bundled
}

function run(bin: string, args: string[], timeoutMs = 25_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, ['--ignore-config', ...args], { windowsHide: true })
    let out = ''
    let err = ''
    const timer = setTimeout(() => proc.kill(), timeoutMs)
    proc.stdout.on('data', (d: Buffer) => { out += d.toString() })
    proc.stderr.on('data', (d: Buffer) => { err += d.toString() })
    proc.on('error', (e) => { clearTimeout(timer); reject(e) })
    proc.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve(out.trim())
      else reject(new Error(err.trim().split('\n').pop() || `yt-dlp exit ${code}`))
    })
  })
}

export function parseFallbackFormats(raw: string): AudioFormat[] {
  const list: any[] = JSON.parse(raw.trim().split('\n').pop() || '[]')
  return list
    .filter((f) => f.url && f.vcodec === 'none' && f.acodec && f.acodec !== 'none' && String(f.protocol ?? '').startsWith('http'))
    .map((f) => {
      const ac = String(f.acodec)
      return {
        itag: Number(f.format_id) || 0,
        url: f.url,
        mime: `audio/${f.ext ?? 'unknown'}`,
        codec: ac.startsWith('mp4a') ? 'AAC' : ac.startsWith('opus') ? 'Opus' : ac,
        kbps: Math.round(Number(f.abr) || Number(f.tbr) || 0),
        sampleRate: Number(f.asr) || 0,
        size: Number(f.filesize ?? f.filesize_approx) || 0,
        headers: f.http_headers ?? {},
      }
    })
}

export async function fallbackFormats(videoId: string): Promise<AudioFormat[] | null> {
  if (!bundled) return null
  try {
    const raw = await run(binary(), [
      `https://www.youtube.com/watch?v=${videoId}`,
      '-f', 'ba/b', '--no-playlist', '--no-warnings', '--socket-timeout', '10',
      '-O', '%(formats)j',
    ])
    const formats = parseFallbackFormats(raw)
    return formats.length ? formats : null
  } catch (e) {
    console.error('[zs-engine] fallback', videoId, (e as Error).message)
    return null
  }
}

// YouTube changes often; keep the fallback current without blocking anything.
async function updateEngine() {
  const state = readState()
  if (Date.now() - (state.checkedAt ?? 0) < 12 * 3600_000) return
  const current = state.version ?? (await run(bundled, ['--version']))
  const rel: any = await fetch('https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest', {
    headers: { 'User-Agent': 'Zsound', Accept: 'application/vnd.github+json' },
  }).then((r) => r.json())
  writeState({ ...state, checkedAt: Date.now() })
  const tag: string | undefined = rel?.tag_name
  const asset = rel?.assets?.find((a: any) => a.name === 'yt-dlp_win.zip')
  if (!tag || !/^\d{4}\.\d{2}\.\d{2}(\.\d+)?$/.test(tag) || tag <= current || !asset) return

  const zip = path.join(engineDir, `${tag}.zip`)
  const dest = path.join(engineDir, tag)
  const body = await fetch(asset.browser_download_url).then((r) => {
    if (!r.ok) throw new Error(`download HTTP ${r.status}`)
    return r.arrayBuffer()
  })
  fs.writeFileSync(zip, Buffer.from(body))
  await new Promise<void>((resolve, reject) => {
    const ps = spawn('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -Force -LiteralPath '${zip}' -DestinationPath '${dest}'`], { windowsHide: true })
    ps.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`unzip exit ${code}`))))
  })
  fs.rmSync(zip, { force: true })
  const got = await run(path.join(dest, 'yt-dlp.exe'), ['--version'])
  if (got !== tag) throw new Error(`engine verify failed: ${got}`)
  writeState({ version: tag, checkedAt: Date.now() })
  for (const d of fs.readdirSync(engineDir)) {
    if (d !== tag && /^\d{4}\.\d{2}\.\d{2}/.test(d)) fs.rmSync(path.join(engineDir, d), { recursive: true, force: true })
  }
  console.log('[zs-engine] fallback updated to', tag)
}

export function initFallback(opts: { userData: string; bundledYtdlp: string }) {
  bundled = opts.bundledYtdlp
  engineDir = path.join(opts.userData, 'engine')
  const t = setTimeout(() => updateEngine().catch((e) => console.error('[zs-engine] fallback update', (e as Error).message)), 15_000)
  t.unref?.()
}
