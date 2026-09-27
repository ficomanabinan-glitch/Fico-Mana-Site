import Link from 'next/link'
import Navbar from '@/components/navbar'
import Footer from '@/components/footer'
import type { WebsiteContent } from '@/lib/website-content'

export default function LegalPage({ content, policy }: { content: WebsiteContent; policy: 'privacy' | 'terms' }) {
  const { copy } = content
  return (
    <main className="min-h-screen bg-black text-white">
      <Navbar />
      <article className="mx-auto max-w-3xl break-words px-6 pb-20 pt-32 md:px-12">
        <h1 className="mb-8 font-serif text-3xl md:text-4xl">{copy[`${policy}Title`]}</h1>
        <div className="space-y-5 text-sm leading-relaxed text-white/75">
          {copy[`${policy}Body`].split(/\n\s*\n/).map((paragraph, index) => (
            <p key={index} className="whitespace-pre-line">{paragraph}</p>
          ))}
          <p>
            {copy[`${policy}Contact`]}{' '}
            {content.publicEmail && <><a href={`mailto:${content.publicEmail}`} className="text-primary underline">{content.publicEmail}</a>{' · '}</>}
            <a href={`tel:${content.phoneNumber.replace(/[^+\d]/g, '')}`} className="underline">{content.phoneNumber}</a>
          </p>
          <p className="pt-4 text-xs text-white/50">{copy[`${policy}Updated`]}</p>
        </div>
        <Link href="/" className="mt-10 inline-flex min-h-11 items-center text-xs uppercase tracking-wider text-white/70 hover:text-white">
          ← {copy.navHome}
        </Link>
      </article>
      <Footer />
    </main>
  )
}
