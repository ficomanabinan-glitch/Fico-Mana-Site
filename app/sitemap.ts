import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/site-metadata'

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date()

  return [
    { url: siteUrl, lastModified, changeFrequency: 'weekly', priority: 1 },
    { url: `${siteUrl}/gallery`, lastModified, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${siteUrl}/packages`, lastModified, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${siteUrl}/terms`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${siteUrl}/privacy`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
  ]
}
