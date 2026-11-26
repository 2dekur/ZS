// Downloads the yt-dlp fallback engine bundled into the installer: pnpm fetch:engine
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const dest = path.resolve('resources/bin/ytdlp')
const zip = path.resolve('resources/bin/yt-dlp_win.zip')
const url = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_win.zip'

fs.mkdirSync(dest, { recursive: true })
const res = await fetch(url)
if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`)
fs.writeFileSync(zip, Buffer.from(await res.arrayBuffer()))
const r = spawnSync('tar', ['-xf', zip, '-C', dest], { stdio: 'inherit' })
fs.rmSync(zip, { force: true })
if (r.status !== 0) throw new Error('extract failed')
const version = spawnSync(path.join(dest, 'yt-dlp.exe'), ['--version'], { encoding: 'utf8' }).stdout.trim()
console.log(`yt-dlp ${version} ready in ${dest}`)
