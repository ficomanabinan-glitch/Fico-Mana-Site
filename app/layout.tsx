import { Analytics } from '@vercel/analytics/next'
import type { Viewport } from 'next'
import { Geist, Geist_Mono, Cormorant_Garamond } from 'next/font/google'
import { rootMetadata } from '@/lib/site-metadata'
import './globals.css'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})
const cormorant = Cormorant_Garamond({
  variable: '--font-cormorant',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
})

export const metadata = rootMetadata

export const viewport: Viewport = {
  colorScheme: 'dark',
  // Match hero backdrop so Android browser chrome blends with the photo (not a black strip)
  themeColor: '#1c2e22',
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`dark ${geistSans.variable} ${geistMono.variable} ${cormorant.variable}`} style={{ backgroundColor: '#1c2e22' }}>
      <head>
        <link rel="preload" href="/breanna-reel.mp4" as="video" type="video/mp4" />
      </head>
      <body className="font-sans antialiased" style={{ backgroundColor: '#1c2e22' }}>
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
