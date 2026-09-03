import Link from 'next/link'
import Navbar from '@/components/navbar'
import Footer from '@/components/footer'
import { createPageMetadata } from '@/lib/site-metadata'

export const metadata = createPageMetadata({
  title: 'Terms of Service',
  description: 'Terms of service for booking and sessions at FICO MANA Studio.',
  path: '/terms',
})

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <Navbar />
      <article className="max-w-3xl mx-auto px-6 md:px-12 pt-32 pb-20">
        <p className="text-[10px] tracking-[0.25em] uppercase text-white/45 mb-3">Legal</p>
        <h1 className="font-serif text-3xl md:text-4xl mb-8">Terms of Service</h1>
        <div className="space-y-5 text-sm text-white/75 leading-relaxed">
          <p>
            By booking with FICO MANA Studio, you agree that your session slot is reserved upon successful
            deposit verification. Until a receipt is approved, the slot may be held temporarily and subject to
            studio confirmation.
          </p>
          <p>
            A non-refundable deposit is required to secure your session unless otherwise stated by the studio.
            Remaining package balances are payable in person on the day of your shoot unless arranged otherwise.
          </p>
          <p>
            Please arrive on time. Late arrivals may shorten your session or require rescheduling subject to
            availability and studio policies. Rescheduling fees may apply when a confirmed date or time is changed.
          </p>
          <p>
            Uploaded payment proofs must be genuine. Invalid, reused, or forged receipts may result in rejection
            and a request to resubmit valid proof.
          </p>
          <p>
            For booking assistance, email{' '}
            <a href="mailto:ficomanaph@gmail.com" className="text-primary underline">
              ficomanaph@gmail.com
            </a>{' '}
            or call +63 49 576 5176.
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
