import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/site-metadata'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin/', '/filtering', '/api/', '/portal/'],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}
