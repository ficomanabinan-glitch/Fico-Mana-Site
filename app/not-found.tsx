import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { siteUrl } from '@/lib/site-metadata'
import styles from './not-found.module.css'

export default function NotFound() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href={siteUrl} prefetch={false} className={styles.brand}>FICO MANA</Link>
        <span>Page not found</span>
      </header>
      <div className={styles.layout}>
        <section className={styles.copy} aria-labelledby="missing-page-title">
          <h1 id="missing-page-title">This page is <br />out of frame.</h1>
          <p>The link may be incomplete, or the page may have moved. Let’s get you back to a familiar place.</p>
          <Link href="/" prefetch={false} className={styles.action}>
            <ArrowLeft size={18} aria-hidden="true" />
            Back to FICO MANA
          </Link>
          <div className={styles.help}>
            <h2>Looking for your photos?</h2>
            <p>Open the original client portal link sent by the studio. If it still doesn’t work, <a href={`${siteUrl}/#contact`}>contact the studio</a> for help.</p>
          </div>
        </section>
        <div className={styles.frame} aria-hidden="true"><span>404</span></div>
      </div>
      <footer className={styles.footer}>FICO MANA Studio</footer>
    </main>
  )
}
