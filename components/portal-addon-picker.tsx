'use client'

import { useState } from 'react'
import { Check, ChevronDown, Plus, X } from 'lucide-react'
import type { ClientAddon, ClientGalleryFile } from './client-photo-selection'
import { PortalChoiceGrid } from './portal-print-picker'
import { addonPhotoError, addonPhotoLimit } from '@/lib/addon-photo-rules'
import styles from './portal-workspace.module.css'

const money = (value: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(value)

export default function PortalAddonPicker({ addons, files, quantities, assignments, locked, typeCount, extraCount, extraPrice, total, complete, onToggle, onQuantity, onPhotos, onWarning, onBack, onContinue }: {
  addons: ClientAddon[]; files: ClientGalleryFile[]; quantities: Record<string, number>; assignments: Record<string, string[]>
  locked: boolean; typeCount: number; extraCount: number; extraPrice: number; total: number; complete: boolean
  onToggle: (addon: ClientAddon) => boolean; onQuantity: (id: string, quantity: number) => void
  onPhotos: (id: string, photos: string[]) => void; onWarning: (message: string) => void; onBack: () => void; onContinue: () => void
}) {
  const [expanded, setExpanded] = useState<string | null>(null)
  return <>
    <div className={styles.heading}><div className={styles.headingCopy}><p className={styles.kicker}>03 · A little more to keep</p><h1>For the moments you want to hold onto.</h1><p className={styles.description}>Optional prints and frames, made from your selected enhanced photographs. Choose up to four add-on types, including Extra Edit.</p></div><span className={styles.printCounter}>{typeCount} / 4 types</span></div>
    <div className={styles.printLayout}><div className={styles.addonList}>
      {extraCount > 0 ? <div className={styles.extraSummary}><span>Extra enhanced photos <small>{extraCount} × {money(extraPrice)}</small></span><strong>{money(extraCount * extraPrice)}</strong></div> : null}
      {addons.length === 0 ? <p className={styles.empty}>No optional add-ons are currently available.</p> : null}
      {addons.map(addon => {
        const active = (quantities[addon.id] || 0) > 0
        const open = expanded === addon.id && active
        const photos = assignments[addon.id] || []
        const limit = addonPhotoLimit(addon)
        const error = active ? addonPhotoError(addon, photos, files.map(file => file.id)) : null
        return <section key={addon.id} className={styles.addonItem} data-addon-id={addon.id} data-selected={active}>
          <div className={styles.addonRow}>
            <button type="button" className={styles.addonToggle} aria-expanded={open} aria-controls={`addon-picker-${addon.id}`} aria-label={`${active ? 'Configure' : 'Add'} ${addon.name}`} onClick={() => {
              if (!active && !onToggle(addon)) return
              setExpanded(open ? null : addon.id)
            }} disabled={locked && !active}>
              <span className={styles.addonIcon}>{active ? <Check size={17} /> : <Plus size={17} />}</span>
              <span className={styles.addonCopy}><strong>{addon.name}</strong><small>{addon.description}</small>{active && limit > 0 ? <small>{photos.length ? `${photos.length} photo${photos.length === 1 ? '' : 's'} assigned` : 'Choose your photo below'}</small> : null}</span>
              <span className={styles.addonPrice}>{money(addon.price)}<small>{addon.pricingType === 'fixed' ? 'per set' : addon.pricingType.replace('_', ' ')}</small></span>
              {active ? <ChevronDown size={15} className={open ? styles.chevronOpen : undefined} /> : null}
            </button>
            {active && !locked ? <button type="button" className={styles.iconButton} aria-label={`Remove ${addon.name}`} onClick={() => { onToggle(addon); if (open) setExpanded(null) }}><X size={16} /></button> : null}
          </div>
          {open ? <div id={`addon-picker-${addon.id}`} className={styles.addonPicker}>
            {addon.maxQuantity > 1 ? <label className={styles.quantity}><span>Quantity</span><input type="number" min={1} max={addon.maxQuantity} value={quantities[addon.id]} disabled={locked} onChange={event => {
              const quantity = Number(event.target.value)
              if (!Number.isInteger(quantity) || quantity < 1 || quantity > addon.maxQuantity) { onWarning(`Choose a quantity between 1 and ${addon.maxQuantity} for ${addon.name}.`); return }
              onWarning(''); onQuantity(addon.id, quantity)
            }} /></label> : null}
            {limit > 0 ? <><p className={styles.printTitle}>Choose {limit === 1 ? 'a photograph' : `up to ${limit} photographs`}</p><p className={styles.description}>Use your included or extra enhanced photographs. Your choices stay saved when this section closes.</p><PortalChoiceGrid files={files} selected={photos} locked={locked} label={addon.name} onToggle={id => {
              onWarning('')
              if (photos.includes(id)) onPhotos(addon.id, photos.filter(value => value !== id))
              else if (limit === 1) onPhotos(addon.id, [id])
              else if (photos.length < limit) onPhotos(addon.id, [...photos, id])
              else onWarning(`${addon.name} allows up to ${limit} photos. Remove one before choosing another.`)
            }} />{error ? <p className={styles.validation}>{error}</p> : null}</> : <p className={styles.description}>This add-on does not require a separate photo assignment.</p>}
          </div> : null}
        </section>
      })}
    </div><aside className={styles.rail} aria-label="Add-on summary"><p className={styles.kicker}>Your additions</p><h2>A personal finishing touch.</h2><dl>{extraCount > 0 ? <div className={styles.summaryRow}><dt>Extra Edit × {extraCount}</dt><dd>{money(extraPrice * extraCount)}</dd></div> : null}{addons.filter(addon => quantities[addon.id] > 0).map(addon => <div className={styles.summaryRow} key={addon.id}><dt>{addon.name}</dt><dd>{assignments[addon.id]?.length || 0} assigned</dd></div>)}<div className={styles.summaryRow}><dt>Total additions</dt><dd><strong>{money(total)}</strong></dd></div></dl>{!complete && !locked ? <p className={styles.validation}>Choose the required photos for each selected add-on before continuing.</p> : null}<button type="button" className={styles.primary} disabled={!complete && !locked} onClick={onContinue}>Continue to Review →</button><p className={styles.note}>Add-ons are optional. You can continue without adding a print or frame.</p></aside></div>
    <div className={styles.footer}><button type="button" className={styles.secondary} onClick={onBack}>← Back to Free Prints</button></div>
  </>
}
