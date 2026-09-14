'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { CheckCircle, AlertTriangle, XCircle, X } from 'lucide-react'
import toastStyles from './admin-toast-provider.module.css'

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

const icons: Record<ToastType, typeof CheckCircle> = {
  success: CheckCircle,
  warning: AlertTriangle,
  error: XCircle,
  info: AlertTriangle,
}

export function AdminToastProvider({ children, portal = false }: { children: React.ReactNode; portal?: boolean }) {
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

  const success = useCallback((title: string, message?: string) => push('success', title, message), [push])
  const warning = useCallback((title: string, message?: string) => push('warning', title, message), [push])
  const error = useCallback((title: string, message?: string) => push('error', title, message), [push])
  const info = useCallback((title: string, message?: string) => push('info', title, message), [push])
  const value = useMemo<ToastContextValue>(
    () => ({ toast: push, success, warning, error, info }),
    [error, info, push, success, warning],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className={`${toastStyles.viewport} ${portal ? toastStyles.portalViewport : toastStyles.workspaceViewport}`}
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((t) => {
          const Icon = icons[t.type]
          return (
            <div
              key={t.id}
              className={toastStyles.toast}
              data-tone={t.type}
              role={t.type === 'error' ? 'alert' : 'status'}
            >
              <div className={toastStyles.layout}>
                <span className={toastStyles.iconWrap} aria-hidden="true">
                  <Icon size={18} strokeWidth={1.75} />
                </span>
                <div className={toastStyles.copy}>
                  <p className={toastStyles.title}>{t.title}</p>
                  {t.message && <p className={toastStyles.message}>{t.message}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(t.id)}
                  className={toastStyles.dismiss}
                  aria-label="Dismiss notification"
                >
                  <X size={16} strokeWidth={1.75} />
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
