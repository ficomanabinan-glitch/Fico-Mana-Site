import type { ReactNode } from 'react'
import PortalQueryProvider from '@/components/portal-query-provider'

export default function PortalLayout({ children }: { children: ReactNode }) {
  return <PortalQueryProvider>{children}</PortalQueryProvider>
}
