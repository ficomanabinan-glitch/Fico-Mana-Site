'use client'

import { useLayoutEffect, type ReactNode } from 'react'

const previewOverview = {
  items: [],
  storage: {
    provider: 'r2',
    configured: true,
    privateBucket: true,
    portalExpiryDays: 30,
    signedUrlTtlSeconds: 900,
  },
}

export default function LocalPreviewProvider({ children }: { children: ReactNode }) {
  useLayoutEffect(() => {
    const originalFetch = window.fetch
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url === '/api/provisioning' || url.endsWith('/api/provisioning')) {
        return Response.json(init?.method === 'PATCH' ? {} : previewOverview)
      }
      return originalFetch(input, init)
    }
    return () => { window.fetch = originalFetch }
  }, [])

  return children
}
