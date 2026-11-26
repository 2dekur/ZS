import { createJSONStorage } from 'jotai/utils'

// The app's memory lives in a file owned by the main process (written ~300 ms after each change),
// so settings survive crashes, forced quits and update installs. Older localStorage values migrate once.
const backend = {
  getItem(key: string): string | null {
    const saved = window.zsound.storeGet(key)
    if (saved !== null) return saved
    const legacy = localStorage.getItem(key)
    if (legacy !== null) window.zsound.storeSet(key, legacy)
    return legacy
  },
  setItem: (key: string, value: string) => window.zsound.storeSet(key, value),
  removeItem: (key: string) => window.zsound.storeSet(key, null),
}

export const fileStorage = createJSONStorage<any>(() => backend)
