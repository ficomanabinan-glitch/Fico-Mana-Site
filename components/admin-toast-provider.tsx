'use client'

import { createContext, useCallback, useContext, useState } from 'react'
import { CheckCircle, AlertTriangle, XCircle, X } from 'lucide-react'

export type ToastType = 'success' | 'warning' | 'error' | 'info'

export type Toast = {
  id: string
  type: ToastType
  title: string
  message?: string
}

type ToastContextValue = {
  toast: (type: ToastType, title: string, message?: string) => void
  success: (title: string, message?: string) => void
  warning: (title: string, message?: string) => void
  error: (title: string, message?: string) => void
  info: (title: string, message?: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const styles: Record<ToastType, string> = {
  success: 'border-green-500/40 bg-green-500/10',
  warning: 'border-amber-500/40 bg-amber-500/10',
  error: 'border-red-500/40 bg-red-500/10',
  info: 'border-primary/40 bg-primary/10',
}

const icons: Record<ToastType, typeof CheckCircle> = {
  success: CheckCircle,
  warning: AlertTriangle,
  error: XCircle,
  info: AlertTriangle,
}

const iconColors: Record<ToastType, string> = {
  success: 'text-green-400',
  warning: 'text-amber-400',
  error: 'text-red-400',
  info: 'text-primary',
}

export function AdminToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const push = useCallback(
    (type: ToastType, title: string, message?: string) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`
      setToasts((prev) => [...prev.slice(-4), { id, type, title, message }])
      window.setTimeout(() => dismiss(id), message ? 6000 : 4500)
    },
    [dismiss],
  )

  const value: ToastContextValue = {
    toast: push,
    success: (title, message) => push('success', title, message),
    warning: (title, message) => push('warning', title, message),
    error: (title, message) => push('error', title, message),
    info: (title, message) => push('info', title, message),
  }

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-[min(100vw-2rem,380px)] pointer-events-none">
        {toasts.map((t) => {
          const Icon = icons[t.type]
          return (
            <div
              key={t.id}
              className={`pointer-events-auto border backdrop-blur-md shadow-2xl p-4 animate-in slide-in-from-right-5 fade-in duration-300 ${styles[t.type]}`}
              role="status"
            >
              <div className="flex gap-3">
                <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${iconColors[t.type]}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white">{t.title}</p>
                  {t.message && <p className="text-xs text-white/60 mt-1 leading-relaxed">{t.message}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(t.id)}
                  className="text-white/40 hover:text-white shrink-0"
                  aria-label="Dismiss"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useAdminToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useAdminToast must be used within AdminToastProvider')
  return ctx
}
