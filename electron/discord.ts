// Discord "Listening to" status over Discord's local IPC pipe (no library, no network).
import net from 'net'

// shortcut: Discord needs an application id from discord.com/developers (app named "Zsound"); empty = feature hidden.
const CLIENT_ID = ''

export const discordAvailable = () => CLIENT_ID !== ''

export interface Playing { title: string; artist: string; thumbnail: string; playing: boolean; duration: number; position: number }

let sock: net.Socket | null = null
let ready = false
let pending: object | null = null

function frame(op: number, payload: object) {
  const json = Buffer.from(JSON.stringify(payload))
  const head = Buffer.alloc(8)
  head.writeInt32LE(op, 0)
  head.writeInt32LE(json.length, 4)
  return Buffer.concat([head, json])
}

function connect(pipe = 0) {
  if (sock || !CLIENT_ID || pipe > 9) return
  const s = net.createConnection(`\\\\?\\pipe\\discord-ipc-${pipe}`)
  s.once('connect', () => {
    sock = s
    s.write(frame(0, { v: 1, client_id: CLIENT_ID }))
  })
  s.on('data', () => {
    if (ready) return
    ready = true
    if (pending) s.write(frame(1, pending))
  })
  s.on('error', () => {
    s.destroy()
    if (!sock) connect(pipe + 1)
  })
  s.on('close', () => {
    sock = null
    ready = false
  })
}

export function setActivity(np: Playing | null, enabled: boolean) {
  if (!CLIENT_ID) return
  const now = Date.now()
  const activity = enabled && np?.playing ? {
    type: 2,
    details: np.title.slice(0, 128),
    state: np.artist.slice(0, 128),
    assets: { large_image: np.thumbnail || undefined, large_text: 'Zsound' },
    timestamps: np.duration ? { start: now - np.position * 1000, end: now + (np.duration - np.position) * 1000 } : undefined,
  } : null
  pending = { cmd: 'SET_ACTIVITY', args: { pid: process.pid, activity }, nonce: String(now) }
  if (!enabled && !sock) return
  if (!sock) return connect()
  if (ready) sock.write(frame(1, pending))
}
