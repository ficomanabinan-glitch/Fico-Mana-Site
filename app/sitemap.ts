import type { MetadataRoute } from 'next'
import { homepageUrl, siteUrl } from '@/lib/site-metadata'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: homepageUrl, changeFrequency: 'weekly', priority: 1 },
    { url: `${siteUrl}/gallery`, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${siteUrl}/packages`, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${siteUrl}/terms`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${siteUrl}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
  ]
}
