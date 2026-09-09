import { AdminToastProvider } from '@/components/admin-toast-provider'
import PortalQueryProvider from '@/components/portal-query-provider'

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <PortalQueryProvider><AdminToastProvider portal>{children}</AdminToastProvider></PortalQueryProvider>
}
