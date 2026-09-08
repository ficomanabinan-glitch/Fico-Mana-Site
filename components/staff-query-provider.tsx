'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { STAFF_PAGE_WARM_MS, STAFF_READ_FRESH_MS } from '@/lib/admin-cache-policy'

/**
 * One private query cache per signed-in staff identity. The provider is keyed
 * by owner in each shell, so data can never carry across an account boundary.
 */
export default function StaffQueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: STAFF_READ_FRESH_MS,
            gcTime: STAFF_PAGE_WARM_MS,
            retry: 1,
            refetchOnMount: false,
            refetchOnReconnect: false,
            refetchOnWindowFocus: false,
          },
        },
      }),
  )

  useEffect(() => () => client.clear(), [client])

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
