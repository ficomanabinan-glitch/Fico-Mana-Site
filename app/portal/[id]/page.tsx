import { Suspense } from 'react'
import { headers } from 'next/headers'
import ClientPortalPage, { type PortalData } from '@/components/client-portal-page'
import PortalPageSkeleton from '@/components/portal-page-skeleton'
import { getPortalData } from '@/lib/editor-workflow'
import { portalPagePayload } from '@/lib/portal-page-payload'
import { API_RATE_LIMITS, enforceApiRateLimit } from '@/lib/security/api-rate-limit'

export const dynamic = 'force-dynamic'

async function PortalContent({ id }: { id: string }) {
  const publicId = id.toLowerCase()
  let initialData: PortalData | null = null
  let initialError = ''
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(publicId)) {
    initialError = 'This portal link is invalid. Try: ask FICO MANA for the complete portal link.'
  } else {
    try {
      // Same viewing policy as the API, including IP limits, expiry and file ownership.
      // This Request supplies context only; it never makes an internal HTTP fetch.
      const request = new Request(`https://ficomana.com/portal/${encodeURIComponent(publicId)}`, { headers: new Headers(await headers()) })
      const limited = await enforceApiRateLimit(request, API_RATE_LIMITS.portalRead, [publicId])
      if (limited) initialError = 'The portal is temporarily unavailable. Try: wait a moment and try again.'
      else initialData = portalPagePayload(publicId, await getPortalData(publicId, 0, 48)) as PortalData
    } catch {
      initialError = 'This client portal is unavailable. Try: refresh this page or ask FICO MANA staff to check your private portal link.'
    }
  }
  return <ClientPortalPage key={publicId} publicId={publicId} initialData={initialData} initialError={initialError} />
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <Suspense fallback={<PortalPageSkeleton />}><PortalContent id={id} /></Suspense>
}
