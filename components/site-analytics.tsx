'use client'

import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'

export default function SiteAnalytics() {
  return (
    <>
      <Analytics beforeSend={event => {
        // Response links are bearer credentials, not analytics page identifiers.
        if (new URL(event.url).pathname.startsWith('/shoot-response/')) return null
        return event
      }} />
      <SpeedInsights />
    </>
  )
}
