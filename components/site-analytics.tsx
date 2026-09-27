'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { PUBLIC_PAGE_PATHS, publicAnalyticsUrl } from '@/lib/public-page-policy'

const Analytics = dynamic(() => import('@vercel/analytics/next').then(module => module.Analytics), { ssr: false })

export default function SiteAnalytics() {
  const pathname = usePathname()
  const [publicHost, setPublicHost] = useState(false)
  useEffect(() => { setPublicHost(['ficomana.com', 'www.ficomana.com'].includes(window.location.hostname)) }, [])
  if (!publicHost || !PUBLIC_PAGE_PATHS.some(path => path === pathname)) return null
  return <Analytics beforeSend={event => {
    const url = publicAnalyticsUrl(event.url)
    return url ? { ...event, url } : null
  }} />
}
