'use client'

import { useEffect, useState } from 'react'
import { Clock3 } from 'lucide-react'
import { portalExpiryNotice, type PortalExpiry } from '@/lib/portal-expiry'

export default function PortalExpiryNotice({ expiry }: { expiry: PortalExpiry }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])

  if (!expiry.expiresAt) return null

  return (
    <section aria-label="Final gallery access period" className="portal-expiry-notice mt-6 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <Clock3 className="mt-0.5 size-4 shrink-0 text-[#C4CEFF]" aria-hidden="true" />
        <div>
          <h2 className="portal-meta-label text-[#C4CEFF]">Final gallery access</h2>
          <p className="mt-2 text-xs leading-relaxed text-white/55" role="status">
            {portalExpiryNotice(expiry, now)}
          </p>
        </div>
      </div>
    </section>
  )
}
