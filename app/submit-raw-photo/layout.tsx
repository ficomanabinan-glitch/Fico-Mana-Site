import type { Metadata } from 'next'
import { createPageMetadata } from '@/lib/site-metadata'

export const metadata: Metadata = createPageMetadata({
  title: 'Submit Photo Selection',
  description:
    'Enter your name and Google Drive folder link with your 5 chosen photos for FICO MANA filtering.',
  path: '/submit-raw-photo',
  noIndex: true,
})

export default function SubmitRawPhotoLayout({ children }: { children: React.ReactNode }) {
  return children
}
