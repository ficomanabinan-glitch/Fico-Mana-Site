import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/site-metadata'
import { headers } from 'next/headers'
import { isAdminHost, isEditorHost } from '@/lib/auth/admin'
import { isNewAdminHost } from '@/lib/new-admin/routing'
import { PRIVATE_PAGE_PATHS } from '@/lib/public-page-policy'

export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = (await headers()).get('host')
  if (isAdminHost(host) || isEditorHost(host) || isNewAdminHost(host)) {
    return { rules: { userAgent: '*', disallow: '/' } }
  }
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: PRIVATE_PAGE_PATHS,
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}
