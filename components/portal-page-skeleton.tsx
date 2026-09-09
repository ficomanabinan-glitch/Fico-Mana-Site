import styles from './portal-workspace.module.css'
const pulse = 'animate-pulse motion-reduce:animate-none rounded-xl bg-white/[0.07]'

export default function PortalPageSkeleton() {
  return <main className={`client-portal ${styles.portal}`} aria-label="Loading Client Portal" aria-busy="true">
    <header className={styles.topbar}><div className={styles.shell}><div className={styles.identity}><div className="space-y-3"><div className={`${pulse} h-3 w-36`} /><div className={`${pulse} h-7 w-48`} /></div><div className={`${pulse} h-11 w-20`} /></div><div className={styles.navigation}>{Array.from({ length: 4 }, (_, index) => <div className={styles.step} key={index}><div className={`${pulse} h-3 w-full max-w-16`} /></div>)}</div></div></header>
    <div className={`${styles.shell} ${styles.main}`}><div className={styles.heading}><div className="w-full space-y-4"><div className={`${pulse} h-3 w-36`} /><div className={`${pulse} h-24 w-full max-w-2xl`} /><div className={`${pulse} h-4 w-3/4`} /></div></div><div className={styles.workspace}><section><div className={`${pulse} mb-4 h-11 w-full`} /><div className={styles.gallery}>{Array.from({ length: 8 }, (_, index) => <div className={`${pulse} aspect-[4/5.35]`} key={index} />)}</div></section><aside className={styles.preview}><div className={`${pulse} h-[65dvh] w-full`} /></aside></div></div>
  </main>
}
