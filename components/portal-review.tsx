'use client'

import type { ClientGalleryFile } from './client-photo-selection'
import PortalPrivateImage from './portal-private-image'
import { PORTAL_PRINT_OPTIONS, type PortalPrintCategory } from './portal-print-picker'
import styles from './portal-workspace.module.css'

const money = (value: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(value)

export default function PortalReview({ included, extras, preference, printSelections, walletSelections, orders, selectedPhoto, packageAmount, amountPaid, total, remaining, acknowledged, locked, submitting, canSubmit, sampleMode = false, onAcknowledge, onBack, onSubmit, onPreview, onEdit }: {
  included: string[]; extras: string[]; preference: string; printSelections: Partial<Record<PortalPrintCategory, string>>; walletSelections: string[]
  orders: Array<{ id: string; name: string; quantity: number; amount: number; photoIds: string[] }>
  selectedPhoto: (id: string) => ClientGalleryFile
  packageAmount: number; amountPaid: number; total: number; remaining: number
  acknowledged: boolean; locked: boolean; submitting: boolean; canSubmit: boolean
  sampleMode?: boolean
  onAcknowledge: (value: boolean) => void; onBack: () => void; onSubmit: () => void
  onPreview: (file: ClientGalleryFile) => void; onEdit: (step: 'photos' | 'prints' | 'addons') => void
}) {
  const strip = (ids: string[]) => <div className={styles.reviewPhotos}>{ids.map(id => {
    const file = selectedPhoto(id)
    return <figure key={id}><button type="button" className={`${styles.pickerImage} ${styles.reviewZoom}`} onClick={() => onPreview(file)} aria-label={`Zoom ${file.fileName}`}><PortalPrivateImage src={file.previewUrl} alt={file.fileName} /></button><figcaption className={styles.filename} title={file.fileName}>{file.fileName}</figcaption></figure>
  })}</div>
  const extraOrder = orders.find(order => order.name.trim().toLowerCase() === 'extra edit')
  const physicalOrders = orders.filter(order => order !== extraOrder)
  const edit = (step: 'photos' | 'prints' | 'addons', label: string) => !locked ? <button type="button" className={styles.secondary} disabled={submitting} onClick={() => onEdit(step)}>{label}</button> : null
  return <>
    <div className={styles.heading}><div className={styles.headingCopy}><h1>Review your choices</h1><p className={styles.description}>Make sure everything looks right before you submit.</p></div></div>
    {locked ? <div className={styles.notice} data-tone="success" role="status">{sampleMode ? 'Sample complete. Your practice choices were not submitted or saved to a booking.' : 'Your final selection has been submitted. Duplicate submission is blocked.'}</div> : null}
    <div className={styles.reviewLayout}><div>
      <section className={styles.reviewSection}><div className={styles.printLegend}><h2 className={styles.printTitle}>Included photographs</h2>{edit('photos', 'Edit photos')}</div><p className={styles.printCounter}>{included.length} photos. Tap one to preview it.</p>{strip(included)}<p className={styles.note}>Editing preference: {preference}</p></section>
      {extras.length ? <section className={styles.reviewSection}><div className={styles.printLegend}><h2 className={styles.printTitle}>Extra enhanced photographs</h2><span className={styles.printCounter}>{extras.length} × {money((extraOrder?.amount || 0) / extras.length)}</span></div>{strip(extras)}</section> : null}
      <section className={styles.reviewSection}><div className={styles.printLegend}><h2 className={styles.printTitle}>Your complimentary prints</h2>{edit('prints', 'Edit prints')}</div><div className={styles.reviewPrints} data-wallet-layout={walletSelections.length > 1 ? 'grid' : 'single'}>{PORTAL_PRINT_OPTIONS.map(option => {
        const ids = option.category === 'WALLET_SIZE' ? walletSelections : [printSelections[option.category]].filter((id): id is string => Boolean(id))
        const usesPhotoGrid = option.category === 'WALLET_SIZE' && ids.length > 1
        return <section key={option.category} data-print-category={option.category} data-photo-layout={usesPhotoGrid ? 'grid' : 'single'} data-photo-count={ids.length}><h3>{option.title}</h3><p className={styles.description}>{option.subtitle}</p>{ids.length ? strip(ids) : <p className={styles.validation}>Not assigned</p>}</section>
      })}</div></section>
      <section className={styles.reviewSection}><div className={styles.printLegend}><h2 className={styles.printTitle}>Your paid additions</h2>{edit('addons', 'Edit add-ons')}</div>{physicalOrders.length ? physicalOrders.map(order => <div key={order.id} className={styles.reviewAddon}><div className={styles.summaryRow}><span>{order.name} × {order.quantity}</span><strong>{money(order.amount)}</strong></div>{order.photoIds.length ? strip(order.photoIds) : <p className={styles.description}>No photo assignment recorded.</p>}</div>) : <p className={styles.description}>No additional prints or frames.</p>}</section>
      <section className={styles.policy}><h2>Before you submit</h2><p>Once the enhanced copies have been released, we will no longer entertain any re-edit concerns or revision requests.</p><label><input type="checkbox" checked={acknowledged} disabled={locked || submitting} onChange={event => onAcknowledge(event.target.checked)} /><span>I have reviewed my photos, editing preferences, free print allocations, and paid add-ons. I understand and acknowledge the no-revision policy above.</span></label></section>
    </div><aside className={styles.checkout} aria-label="Payment summary"><h2>Payment summary</h2><dl>
      {[['Package amount', packageAmount], ['Extra enhanced photos', extraOrder?.amount || 0], ['Prints & frames', physicalOrders.reduce((sum, order) => sum + order.amount, 0)], ['Booking total', total], ['Amount paid', amountPaid]].map(([label, amount]) => <div className={styles.summaryRow} key={label}><dt>{label}</dt><dd>{money(Number(amount))}</dd></div>)}
      <div className={styles.balance}><dt>Remaining balance</dt><dd>{money(remaining)}</dd></div>
    </dl>{!locked ? <><button type="button" className={styles.primary} disabled={!canSubmit || submitting} onClick={onSubmit}>{submitting ? 'Submitting your selection…' : sampleMode ? 'Finish sample' : 'Submit Final Selection'}</button>{!sampleMode ? <p className={styles.note}>We’ll ask for the last four digits of your booking phone number to confirm.</p> : <p className={styles.note}>This practice selection will not change a real booking.</p>}</> : <p className={styles.description}>{sampleMode ? 'Sample finished. Open your private portal link when you are ready to choose your own photos.' : 'Your choices are saved with FICO MANA.'}</p>}</aside></div>
    <div className={styles.footer}><button type="button" className={styles.secondary} onClick={onBack}>← Back to Add-ons</button></div>
  </>
}
