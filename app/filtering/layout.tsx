import type { Metadata } from 'next'
import { createPageMetadata } from '@/lib/site-metadata'

export const metadata: Metadata = createPageMetadata({
  title: 'Filtering Queue',
  description: 'Staff raw photo filtering dashboard for FICO MANA Studio.',
  path: '/filtering',
  noIndex: true,
})

export default function FilteringLayout({ children }: { children: React.ReactNode }) {
  return children
}
