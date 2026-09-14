import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import styles from '@/components/portal-workspace.module.css'

export const metadata = {
  title: 'Client Portal | FICO MANA',
  description: 'Preview the FICO MANA photo-selection experience or open the private portal link sent with your booking.',
}

export default function PortalWelcomePage() {
  return <main className={styles.onboardingPage}>
    <div className={styles.onboardingShell}>
      <header className={styles.onboardingHeader}><Link href="/" className={styles.onboardingBrand}>FICO MANA</Link><Link href="/" className={styles.onboardingExit}>Return to website</Link></header>
      <section className={styles.onboardingIntro}>
        <div><h1>Choose your photos with confidence.</h1><p>Try the same simple flow clients use to select favorites, assign complimentary prints, and review everything before submission.</p></div>
        <div className={styles.onboardingActions}><Link href="/portal/sample" className={styles.onboardingPrimary}>Try the sample portal <ArrowRight size={17} strokeWidth={1.5} aria-hidden="true" /></Link><p>Uses example photos and booking details. Nothing is submitted to a booking.</p></div>
      </section>
      <ol className={styles.onboardingSteps} aria-label="How the Client Portal works">
        <li><span>Choose</span><strong>Pick five favorites</strong><p>Open any photo for a closer look, then select your included choices.</p></li>
        <li><span>Personalize</span><strong>Assign your free prints</strong><p>Use your selected photos for each print included in the package.</p></li>
        <li><span>Confirm</span><strong>Review before sending</strong><p>Check the photos, print choices, additions, and balance in one place.</p></li>
      </ol>
      <p className={styles.onboardingPrivate}>Already booked? Open the private Client Portal link sent by FICO MANA. Each link is connected to one booking.</p>
    </div>
  </main>
}
