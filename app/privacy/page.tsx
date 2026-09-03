import Link from 'next/link'
import Navbar from '@/components/navbar'
import Footer from '@/components/footer'
import { createPageMetadata } from '@/lib/site-metadata'

export const metadata = createPageMetadata({
  title: 'Privacy Policy',
  description: 'How FICO MANA Studio collects, uses, and protects your personal information.',
  path: '/privacy',
})

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <Navbar />
      <article className="max-w-3xl mx-auto px-6 md:px-12 pt-32 pb-20">
        <p className="text-[10px] tracking-[0.25em] uppercase text-white/45 mb-3">Legal</p>
        <h1 className="font-serif text-3xl md:text-4xl mb-8">Privacy Policy</h1>
        <div className="space-y-5 text-sm text-white/75 leading-relaxed">
          <p>
            FICO MANA Studio (&ldquo;we&rdquo;, &ldquo;us&rdquo;) collects personal information you provide when booking a
            session — including your name, email, phone number, and payment receipt details — to schedule,
            verify, and confirm your reservation.
          </p>
          <p>
            Booking and payment records may be stored in our secure database and emailed to you for
            confirmation, receipts, and status updates. We do not sell your personal information to third parties.
          </p>
          <p>
            Payment screenshots and transaction references are used only for deposit verification. Access is
            limited to studio staff involved in booking operations.
          </p>
          <p>
            For privacy questions or data requests, contact us at{' '}
            <a href="mailto:ficomanaph@gmail.com" className="text-primary underline">
              ficomanaph@gmail.com
            </a>{' '}
            or +63 49 576 5176.
          </p>
          <p className="text-white/45 text-xs pt-4">Last updated: July 2026 · Cabuyao Retail Plaza, Laguna</p>
        </div>
        <Link href="/" className="inline-block mt-10 text-xs uppercase tracking-wider text-white/60 hover:text-white">
          ← Back to home
        </Link>
      </article>
      <Footer />
    </main>
  )
}
