'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'

const PORTAL_FRESH_MS = 60_000
const PORTAL_WARM_MS = 15 * 60_000

/**
 * Keeps previously viewed portal data in this browser tab only. API reads are
 * still private/no-store and always revalidated in the background.
 */
export default function PortalQueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: PORTAL_FRESH_MS,
        gcTime: PORTAL_WARM_MS,
        retry: 1,
        refetchOnMount: false,
        refetchOnReconnect: false,
        refetchOnWindowFocus: false,
      },
    },
  }))

  useEffect(() => () => client.clear(), [client])

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
