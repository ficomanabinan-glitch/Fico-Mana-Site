import type { Metadata } from 'next'
import { getSiteUrl } from '@/lib/site-url'

export const siteUrl = getSiteUrl()
export const siteName = 'FICO MANA'
export const socialPreviewUrl = `${siteUrl}/og-homepage.jpg?v=1`

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
  alt: 'FICO MANA Studio — The Portrait of Success',
  type: 'image/jpeg',
  width: 1200,
  height: 630,
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
      images: [ogImage.url],
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
    url: '/',
    siteName,
    title: `${siteName} Studio — The Portrait of Success`,
    description: siteDescription,
    images: [defaultOgImage],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${siteName} Studio — The Portrait of Success`,
    description: siteDescription,
    images: [defaultOgImage.url],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
}
