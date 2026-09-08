import type { ReactNode } from 'react'
import PortalQueryProvider from '@/components/portal-query-provider'
import './portal-final.css'
import './portal-final-overrides.css'

export default function PortalLayout({ children }: { children: ReactNode }) {
  return <PortalQueryProvider>{children}</PortalQueryProvider>
}
