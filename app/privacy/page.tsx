import LegalPage from '@/components/legal-page'
import { getPublishedWebsiteContent } from '@/lib/website-content-server'
import { createPageMetadata } from '@/lib/site-metadata'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const { copy } = await getPublishedWebsiteContent()
  return createPageMetadata({ title: copy.privacyTitle, description: copy.privacyDescription, path: '/privacy' })
}

export default async function Page() {
  return <LegalPage policy="privacy" content={await getPublishedWebsiteContent()} />
}
