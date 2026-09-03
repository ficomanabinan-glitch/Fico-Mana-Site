import Navbar from '@/components/navbar'
import SelfPortraitPackages from '@/components/self-portrait-packages'
import Footer from '@/components/footer'
import { createPageMetadata } from '@/lib/site-metadata'

export const metadata = createPageMetadata({
  title: 'FICO & MANA Packages',
  description:
    'Self portrait packages for solo, duo, family, and barkada sessions at FICO MANA Studio in Cabuyao, Laguna.',
  path: '/packages',
})

export default function PackagesPage() {
  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-20 md:pt-24">
        <SelfPortraitPackages showBackLink />
      </div>
      <Footer />
    </main>
  )
}
