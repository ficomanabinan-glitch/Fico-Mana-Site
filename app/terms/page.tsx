import LegalPage from '@/components/legal-page'
import { getPublishedWebsiteContent } from '@/lib/website-content-server'
import { createPageMetadata } from '@/lib/site-metadata'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const { copy } = await getPublishedWebsiteContent()
  return createPageMetadata({ title: copy.termsTitle, description: copy.termsDescription, path: '/terms' })
}

export default async function Page() {
  return <LegalPage policy="terms" content={await getPublishedWebsiteContent()} />
}
