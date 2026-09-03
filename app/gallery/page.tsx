import Navbar from '@/components/navbar'
import Gallery from '@/components/gallery'
import Footer from '@/components/footer'
import { createPageMetadata } from '@/lib/site-metadata'

export const metadata = createPageMetadata({
  title: 'Graduation Gallery',
  description:
    'Browse graduation portraits from FICO MANA Studio — elegant, timeless, and uniquely yours.',
  path: '/gallery',
})

export default function GalleryPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <Navbar />
      <div className="pt-20 md:pt-24">
        <Gallery />
      </div>
      <Footer />
    </main>
  )
}
