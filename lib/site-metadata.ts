import type { Metadata } from 'next'
import { CANONICAL_SITE_URL } from '@/lib/site-url'

// SEO must not inherit a localhost, preview-deployment or staff-host URL.
// Keep getSiteUrl() unchanged for the existing email/auth/business workflows.
export const siteUrl = CANONICAL_SITE_URL
export const homepageUrl = `${siteUrl}/`
export const siteName = 'FICO MANA'
export const socialPreviewUrl = `${siteUrl}/social/ficomana-homepage-v4.jpg`

export const siteDescription =
  'FICO MANA is a premier self-portrait and graduation photography studio in Cabuyao, Laguna. Book your session for timeless portraits, professional lighting, and an unforgettable studio experience.'

export const siteKeywords = [
  'FICO MANA',
  'self portrait studio',
  'graduation photography',
  'Cabuyao photography',
  'Laguna photo studio',
  'graduation portraits',
  'portrait studio Philippines',
]

export const defaultOgImage = {
  url: socialPreviewUrl,
  secureUrl: socialPreviewUrl,
  width: 1200,
  height: 630,
  alt: 'FICO MANA homepage with the studio logo, graduation portrait, and The Portrait of Success headline',
  type: 'image/jpeg',
}

type PageMetadataOptions = {
  title: string
  description?: string
  path: string
  ogImage?: typeof defaultOgImage
  noIndex?: boolean
}

export function createPageMetadata({
  title,
  description = siteDescription,
  path,
  ogImage = defaultOgImage,
  noIndex = false,
}: PageMetadataOptions): Metadata {
  const pageTitle = `${title} | ${siteName}`
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: 'website',
      locale: 'en_PH',
      url: path,
      siteName,
      title: pageTitle,
      description,
      images: [ogImage],
    },
    twitter: {
      card: 'summary_large_image',
      title: pageTitle,
      description,
      images: [{ url: ogImage.url, alt: ogImage.alt }],
    },
    ...(noIndex ? { robots: { index: false, follow: false } } : {}),
  }
}

export const rootMetadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: siteName, template: `%s | ${siteName}` },
  description: siteDescription,
  applicationName: siteName,
  authors: [{ name: `${siteName} Studio`, url: siteUrl }],
  creator: `${siteName} Studio`,
  keywords: siteKeywords,
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
    shortcut: '/favicon.ico',
  },
  openGraph: {
    type: 'website',
    locale: 'en_PH',
    url: homepageUrl,
    siteName,
    title: `${siteName} Studio — The Portrait of Success`,
    description: siteDescription,
    images: [defaultOgImage],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${siteName} Studio — The Portrait of Success`,
    description: siteDescription,
    images: [{ url: defaultOgImage.url, alt: defaultOgImage.alt }],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
}

// Page-scoped: do not make private/client routes canonical to the homepage.
export const homepageMetadata: Metadata = {
  alternates: { canonical: homepageUrl },
}
