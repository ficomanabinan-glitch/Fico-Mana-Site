'use client'

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { RefreshCw } from 'lucide-react'
import { adminBtnGhost } from '@/lib/admin-ui'

type RefreshLocation = { target: HTMLDivElement | null; setTarget: (target: HTMLDivElement | null) => void }
const RefreshLocationContext = createContext<RefreshLocation | null>(null)

/** Only the render location changes; the page keeps its callback and loading state. */
export function WorkspaceRefreshProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLDivElement | null>(null)
  const value = useMemo(() => ({ target, setTarget }), [target])
  return <RefreshLocationContext.Provider value={value}>{children}</RefreshLocationContext.Provider>
}

export function WorkspaceRefreshTarget() {
  const location = useContext(RefreshLocationContext)
  return <div ref={location?.setTarget} data-workspace-refresh className="flex shrink-0 items-center gap-2 empty:hidden" />
}

export function WorkspaceRefresh({ children }: { children: ReactNode }) {
  const location = useContext(RefreshLocationContext)
  // Standalone views retain their refresh control if no workspace shell is present.
  if (!location) return children
  return location.target ? createPortal(children, location.target) : null
}

export function WorkspaceRefreshButton({ onRefresh, refreshing = false }: {
  onRefresh: () => void | Promise<void>
  refreshing?: boolean
}) {
  const label = refreshing ? 'Refreshing…' : 'Refresh'
  return <WorkspaceRefresh>
    <button type="button" onClick={onRefresh} disabled={refreshing} aria-busy={refreshing} aria-label={label} title={label}
      className={`${adminBtnGhost} inline-flex shrink-0 items-center justify-center gap-2 px-3 py-2 sm:px-4 sm:py-2.5`}>
      <RefreshCw aria-hidden="true" className={`size-3.5 shrink-0 ${refreshing ? 'animate-spin' : ''}`} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  </WorkspaceRefresh>
}
