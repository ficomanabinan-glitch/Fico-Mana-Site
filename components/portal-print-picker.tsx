'use client'

import { Check } from 'lucide-react'
import PortalPrivateImage from '@/components/portal-private-image'
import type { ClientGalleryFile } from '@/components/client-photo-selection'
import styles from './portal-workspace.module.css'

export type PortalPrintCategory = 'TOGA_PICTURE_4R' | 'ALAMPAY_BARONG_4R' | 'FRAME_8R' | 'WALLET_SIZE'
export const PORTAL_PRINT_OPTIONS: Array<{ category: PortalPrintCategory; title: string; subtitle: string; max: number }> = [
  { category: 'TOGA_PICTURE_4R', title: 'Toga picture', subtitle: '4R Size Printed / FREE', max: 1 },
  { category: 'ALAMPAY_BARONG_4R', title: 'Alampay / Barong', subtitle: '4R Size Printed / FREE', max: 1 },
  { category: 'FRAME_8R', title: 'Frame', subtitle: '8R Size Printed / FREE', max: 1 },
  { category: 'WALLET_SIZE', title: 'Wallet size', subtitle: '4 Copies / FREE · Choose one to four different included photos', max: 4 },
]

export function PortalChoiceGrid({ files, selected, locked, label, onToggle }: {
  files: ClientGalleryFile[]; selected: string[]; locked: boolean; label: string; onToggle: (id: string) => void
}) {
  return <div className={styles.picker}>{files.map(file => <button key={file.id} type="button" className={styles.pickerOption}
    aria-label={`${selected.includes(file.id) ? 'Remove' : 'Use'} ${file.fileName} for ${label}`} aria-pressed={selected.includes(file.id)} disabled={locked} onClick={() => onToggle(file.id)}>
    <span className={styles.pickerImage}><PortalPrivateImage src={file.previewUrl} alt={file.fileName} /></span>
    <span className={styles.filename}>{file.fileName}</span>
    {selected.includes(file.id) ? <span className={styles.selectedMark}><Check size={14} strokeWidth={1.5} /></span> : null}
  </button>)}</div>
}

export default function PortalPrintPicker({ files, printSelections, walletSelections, locked, complete, onPrint, onWallet, onBack, onContinue, onWarning }: {
  files: ClientGalleryFile[]; printSelections: Partial<Record<PortalPrintCategory, string>>; walletSelections: string[]
  locked: boolean; complete: boolean; onPrint: (category: PortalPrintCategory, id: string) => void; onWallet: (ids: string[]) => void
  onBack: () => void; onContinue: () => void; onWarning: (message: string) => void
}) {
  return <>
    <div className={styles.heading}><div className={styles.headingCopy}><h1>Choose your free prints</h1><p className={styles.description}>Pick a photo for each print. You can reuse the same photo.</p></div></div>
    <div className={styles.printLayout}>
      <div className={styles.printStack}>{PORTAL_PRINT_OPTIONS.map(option => {
        const selected = option.max === 4 ? walletSelections : printSelections[option.category] ? [printSelections[option.category]!] : []
        return <fieldset key={option.category} className={styles.printGroup}>
          <legend className={styles.printLegend}><span><span className={styles.printTitle}>{option.title}</span><span className={styles.printSubtitle}>{option.subtitle}</span></span><span className={styles.printCounter}>{selected.length} / {option.max}</span></legend>
          <PortalChoiceGrid files={files} selected={selected} locked={locked} label={option.title} onToggle={id => {
            onWarning('')
            if (option.max === 1) { onPrint(option.category, selected.includes(id) ? '' : id); return }
            if (selected.includes(id)) onWallet(selected.filter(value => value !== id))
            else if (selected.length < 4) onWallet([...selected, id])
            else onWarning('Wallet Size allows up to four different included photos. Remove one before choosing another.')
          }} />
        </fieldset>
      })}</div>
      <aside className={styles.rail} aria-label="Print summary"><h2>Print selections</h2><dl>{PORTAL_PRINT_OPTIONS.map(option => {
        const ids = option.max === 4 ? walletSelections : [printSelections[option.category]].filter((id): id is string => Boolean(id))
        return <div className={styles.summaryRow} key={option.category}><dt>{option.title}</dt><dd>{ids.length ? ids.map(id => files.find(file => file.id === id)?.fileName || 'Selected photo').join(', ') : 'Choose a photo'}</dd></div>
      })}</dl>{!complete && !locked ? <p className={styles.validation}>Choose a photo for every free print category.</p> : null}<button type="button" className={styles.primary} disabled={!complete && !locked} onClick={onContinue}><span>Continue to Add-ons</span><span className={styles.buttonIcon} aria-hidden="true">→</span></button></aside>
    </div>
    <div className={styles.footer}><button type="button" className={styles.secondary} onClick={onBack}>← Back</button></div>
  </>
}
