import Navbar from '@/components/navbar'
import Hero from '@/components/hero'
import Gallery from '@/components/gallery'
import Reels from '@/components/reels'
import About from '@/components/about'
import SchoolAffiliations from '@/components/school-affiliations'
import Testimonials from '@/components/testimonials'
import PackageTeaser from '@/components/package-teaser'
import Pricing from '@/components/pricing'
import FAQ from '@/components/faq'
import Contact from '@/components/contact'
import DeferredBooking from '@/components/deferred-booking'
import Footer from '@/components/footer'
import { homepageMetadata } from '@/lib/site-metadata'

export const metadata = homepageMetadata

export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white">
      <Navbar />
      <Hero />
      <Gallery />
      <Reels />
      <About />
      <SchoolAffiliations />
      <Testimonials />
      <Pricing />
      <PackageTeaser />
      <FAQ />
      <Contact />
      <DeferredBooking />
      <Footer />
    </main>
  )
}
