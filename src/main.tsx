import React from 'react'
import ReactDOM from 'react-dom/client'
import { getDefaultStore } from 'jotai'
import App from './App'
import { startController } from './audio/controller'
import { appInfoAtom, updateStateAtom } from './store/player'
import { langAtom } from './i18n'
import './styles/global.css'

const store = getDefaultStore()
const root = document.documentElement
root.dataset.anim = 'full'
root.lang = store.get(langAtom)
store.sub(langAtom, () => { root.lang = store.get(langAtom) })

window.zsound.appInfo().then((info) => {
  store.set(appInfoAtom, info)
  // GPU animations only when the GPU actually draws the UI.
  root.dataset.anim = info.hardwareAcceleration ? 'full' : 'lite'
})
window.zsound.onUpdate((s) => store.set(updateStateAtom, s))

startController()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
