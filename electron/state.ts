// The renderer's persistent state (settings, likes, playlists, queue…) as one JSON file in userData.
// Written ~300 ms after each change via tmp + rename, flushed on quit, so nothing is lost on a crash.
import fs from 'fs'
import path from 'path'

let file = ''
let data: Record<string, string> = {}
let timer: ReturnType<typeof setTimeout> | undefined

export function initState(userData: string) {
  file = path.join(userData, 'zsound-state.json')
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')) } catch { data = {} }
}

export const getItem = (key: string): string | null => (key in data ? data[key] : null)

export function setItem(key: string, value: string | null) {
  if (value === null) delete data[key]
  else data[key] = value
  timer ??= setTimeout(flushState, 300)
}

export function flushState() {
  clearTimeout(timer)
  timer = undefined
  if (!file) return
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(data))
  fs.renameSync(tmp, file)
}

export function savedSettings(): { closeToTray?: boolean; discord?: boolean } {
  try { return JSON.parse(data['zs.settings'] ?? '{}') } catch { return {} }
}
