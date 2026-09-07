'use client'

import type { ReactNode, ComponentProps } from 'react'
import { Circle, CircleCheck, CircleAlert, Clock3, ExternalLink, Inbox } from 'lucide-react'
import { Button as ShadcnButton } from '@/components/ui/button'
import styles from './new-admin.module.css'

export function Button({ className = '', primary = false, ...props }: ComponentProps<typeof ShadcnButton> & { primary?: boolean }) {
  return <ShadcnButton {...props} className={`${styles.button} ${primary ? styles.primary : ''} ${className}`} />
}
export function ExternalAction({ href, children, primary = false, disabled = false }: { href: string; children: ReactNode; primary?: boolean; disabled?: boolean }) {
  if (disabled) return <Button disabled title="No completed selections are available to download yet.">{children}</Button>
  return <a className={`${styles.action} ${primary ? styles.primary : ''}`} href={href} target="_blank" rel="noopener noreferrer">{children}<ExternalLink size={14} aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a>
}
export function Panel({ title, action, children, body = false }: { title?: string; action?: ReactNode; children: ReactNode; body?: boolean }) {
  return <section className={styles.panel}>{title && <header className={styles.panelHeader}><h2>{title}</h2>{action}</header>}<div className={body ? styles.panelBody : undefined}>{children}</div></section>
}
export function Status({ value }: { value: string }) {
  const label = ({ READY_FOR_EDITING: 'Pending download', EDITING: 'Downloaded', READY_TO_UPLOAD: 'Downloaded' } as Record<string,string>)[value] ?? value.toLowerCase().replaceAll('_', ' ').replace(/^./, s => s.toUpperCase())
  const tone = /fail|reject|cancel|expired/i.test(label) ? 'error' : /pending|waiting|unpaid|partial|not started|not connected|reconnect/i.test(label) ? 'warning' : /\b(completed|delivered|paid full|approved|connected|active)\b/i.test(label) ? 'success' : /download|upload|confirmed|submitted/i.test(label) ? 'info' : 'neutral'
  const Icon = tone === 'success' ? CircleCheck : tone === 'error' ? CircleAlert : tone === 'warning' ? Clock3 : Circle
  return <span className={styles.badge} data-tone={tone}><Icon size={12} aria-hidden="true" />{label}</span>
}
export function Empty({ title = 'Nothing here yet', children }: { title?: string; children: ReactNode }) {
  return <div className={styles.empty}><Inbox size={32} aria-hidden="true" /><h3>{title}</h3><p>{children}</p></div>
}
export function Loading() {
  return <div role="status" aria-label="Loading studio records" className={styles.stack}><div className={styles.grid}>{[0,1,2,3].map(i => <div className={`${styles.panel} ${styles.metric}`} key={i}><span className={styles.skeleton} style={{ height: 16, width: '65%' }} /><span className={styles.skeleton} style={{ height: 42, width: '45%', marginTop: 24 }} /></div>)}</div><div className={styles.panel}>{[0,1,2,3,4].map(i => <div key={i} className={styles.skeletonRow}>{[0,1,2,3].map(j => <span key={j} className={styles.skeleton} />)}</div>)}</div></div>
}
