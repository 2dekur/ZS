import { useEffect } from 'react'
import { useAtom } from 'jotai'
import { toastAtom } from '../store/player'

export default function Toast() {
  const [toast, setToast] = useAtom(toastAtom)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(t)
  }, [toast, setToast])

  if (!toast) return null
  return (
    <div key={toast.id} role="status" className="fixed left-1/2 -translate-x-1/2 bottom-28 z-50 px-4 py-2 rounded-full text-sm text-zs-text fade-in ctx-menu">
      {toast.msg}
    </div>
  )
}
