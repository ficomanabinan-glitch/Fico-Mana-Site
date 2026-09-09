'use client'

import type { ClientGalleryFile } from './client-photo-selection'
import PortalPrivateImage from './portal-private-image'
import { PORTAL_PRINT_OPTIONS, type PortalPrintCategory } from './portal-print-picker'
import styles from './portal-workspace.module.css'

const money = (value: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(value)

export default function PortalReview({ included, extras, preference, printSelections, walletSelections, orders, selectedPhoto, packageAmount, amountPaid, total, remaining, acknowledged, locked, submitting, canSubmit, onAcknowledge, onBack, onSubmit }: {
  included: string[]; extras: string[]; preference: string; printSelections: Partial<Record<PortalPrintCategory, string>>; walletSelections: string[]
  orders: Array<{ id: string; name: string; quantity: number; amount: number; photoIds: string[] }>
  selectedPhoto: (id: string) => ClientGalleryFile
  packageAmount: number; amountPaid: number; total: number; remaining: number
  acknowledged: boolean; locked: boolean; submitting: boolean; canSubmit: boolean
  onAcknowledge: (value: boolean) => void; onBack: () => void; onSubmit: () => void
}) {
  const strip = (ids: string[]) => <div className={styles.reviewPhotos}>{ids.map(id => {
    const file = selectedPhoto(id)
    return <figure key={id}><div className={styles.pickerImage}><PortalPrivateImage src={file.previewUrl} alt={file.fileName} /></div><figcaption className={styles.filename} title={file.fileName}>{file.fileName}</figcaption></figure>
  })}</div>
  const extraOrder = orders.find(order => order.name.trim().toLowerCase() === 'extra edit')
  const physicalOrders = orders.filter(order => order !== extraOrder)
  return <>
    <div className={styles.heading}><div className={styles.headingCopy}><p className={styles.kicker}>04 · Your final selection</p><h1>One last look, before we make them yours.</h1><p className={styles.description}>Review your photographs, print choices and additions. Nothing is submitted until you confirm with your booking PIN.</p></div></div>
    {locked ? <div className={styles.notice} data-tone="success" role="status">Your final selection has been submitted. Duplicate submission is blocked.</div> : null}
    <div className={styles.reviewLayout}><div>
      <section className={styles.reviewSection}><div className={styles.printLegend}><h2 className={styles.printTitle}>Included photographs</h2><span className={styles.printCounter}>{included.length} included</span></div>{strip(included)}<p className={styles.note}>Editing preference: {preference}</p></section>
      {extras.length ? <section className={styles.reviewSection}><div className={styles.printLegend}><h2 className={styles.printTitle}>Extra enhanced photographs</h2><span className={styles.printCounter}>{extras.length} × {money((extraOrder?.amount || 0) / extras.length)}</span></div>{strip(extras)}</section> : null}
      <section className={styles.reviewSection}><h2 className={styles.printTitle}>Your complimentary prints</h2><div className={styles.reviewPrints}>{PORTAL_PRINT_OPTIONS.map(option => {
        const ids = option.category === 'WALLET_SIZE' ? walletSelections : [printSelections[option.category]].filter((id): id is string => Boolean(id))
        return <section key={option.category}><h3>{option.title}</h3><p className={styles.description}>{option.subtitle}</p>{ids.length ? strip(ids) : <p className={styles.validation}>Not assigned</p>}</section>
      })}</div></section>
      <section className={styles.reviewSection}><h2 className={styles.printTitle}>Your paid additions</h2>{physicalOrders.length ? physicalOrders.map(order => <div key={order.id} className={styles.reviewAddon}><div className={styles.summaryRow}><span>{order.name} × {order.quantity}</span><strong>{money(order.amount)}</strong></div>{order.photoIds.length ? strip(order.photoIds) : <p className={styles.description}>No photo assignment recorded.</p>}</div>) : <p className={styles.description}>No additional prints or frames.</p>}</section>
      <section className={styles.policy}><h2>Before you submit</h2><p>Once the enhanced copies have been released, we will no longer entertain any re-edit concerns or revision requests.</p><label><input type="checkbox" checked={acknowledged} disabled={locked || submitting} onChange={event => onAcknowledge(event.target.checked)} /><span>I have reviewed my photos, editing preferences, free print allocations, and paid add-ons. I understand and acknowledge the no-revision policy above.</span></label></section>
    </div><aside className={styles.checkout} aria-label="Payment summary"><p className={styles.kicker}>Your booking</p><h2>The details, together.</h2><dl>
      {[['Package amount', packageAmount], ['Extra enhanced photos', extraOrder?.amount || 0], ['Prints & frames', physicalOrders.reduce((sum, order) => sum + order.amount, 0)], ['Booking total', total], ['Amount paid', amountPaid]].map(([label, amount]) => <div className={styles.summaryRow} key={label}><dt>{label}</dt><dd>{money(Number(amount))}</dd></div>)}
      <div className={styles.balance}><dt>Remaining balance</dt><dd>{money(remaining)}</dd></div>
    </dl>{!locked ? <><button type="button" className={styles.primary} disabled={!canSubmit || submitting} onClick={onSubmit}>{submitting ? 'Submitting your selection…' : 'Submit Final Selection'}</button><p className={styles.note}>We’ll ask for the last four digits of your booking phone number to confirm.</p></> : <p className={styles.description}>Your choices are saved with FICO MANA.</p>}</aside></div>
    <div className={styles.footer}><button type="button" className={styles.secondary} onClick={onBack}>← Back to Add-ons</button></div>
  </>
}
