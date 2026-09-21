'use client'

import { useEffect, useState } from 'react'
import { Clock3 } from 'lucide-react'
import { portalExpiryNotice, type PortalExpiry } from '@/lib/portal-expiry'

export default function PortalExpiryNotice({ expiry, className = '' }: { expiry: PortalExpiry; className?: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])
  return <section aria-label="Portal expiry" className={`mt-6 rounded-card border border-[#C4CEFF]/15 bg-[#C4CEFF]/[0.04] p-5 ${className}`}>
    <h2 className="flex items-center gap-2 text-caption font-semibold uppercase tracking-wider text-[#C4CEFF]"><Clock3 className="size-4 shrink-0"/>Portal expiry</h2>
    <p className="mt-2 text-xs leading-relaxed text-white/55" role="status">{portalExpiryNotice(expiry, now)}</p>
  </section>
}
