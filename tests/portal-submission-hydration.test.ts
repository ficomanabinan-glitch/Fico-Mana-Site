import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { loadTs } from './helpers/load-ts.ts'
import * as summary from '../lib/client-selection-summary.ts'
import * as drafts from '../lib/portal-selection-draft.ts'
import * as navigation from '../lib/selection-step-navigation.ts'
import type { ClientSelection } from '../components/client-photo-selection.tsx'

const Empty = () => null
const component = loadTs<typeof import('../components/client-photo-selection.tsx')>('components/client-photo-selection.tsx', {
  '@/components/portal-photo-preview': { PortalPhotoPreview: Empty },
  '@/components/portal-photo-contact-sheet': Empty,
  '@/components/portal-print-picker': { default: Empty, portalPrintOptions: () => [] },
  '@/components/portal-addon-picker': Empty,
  '@/components/portal-review': Empty,
  '@/components/password-visibility-toggle': { PasswordVisibilityToggle: Empty },
  '@/components/portal-workspace.module.css': {},
  '@/components/admin-toast-provider': { useAdminToast: () => ({ success() {} }) },
  '@/lib/client-selection-summary': summary,
  '@/lib/portal-selection-draft': drafts,
  '@/lib/selection-step-navigation': navigation,
  '@/lib/private-attachment-download': { startPrivateAttachmentDownload: async () => undefined },
  '@/components/ui/sheet': { Sheet: Empty, SheetContent: Empty, SheetHeader: Empty, SheetTitle: Empty, SheetDescription: Empty },
})

const selection: ClientSelection = {
  id: 'synthetic-selection', status: 'SUBMITTED', requiredCount: 2, includedLimit: 2,
  clientStatus: 'READY_FOR_EDITING', noRevisionAcknowledged: true,
  submittedAt: '2026-09-30T17:02:30.000Z', selectedIds: ['photo-1', 'photo-2'],
  selectedItems: [
    { fileId: 'photo-1', preference: 'standard', extraEdit: false },
    { fileId: 'photo-2', preference: 'standard', extraEdit: false },
  ],
  printAllocations: [], addonOrders: [], totalAddonAmount: 0,
}

function render() {
  return renderToStaticMarkup(createElement(component.ClientPhotoSelection, {
    publicId: 'synthetic-portal', packageCategory: 'pinning', selection,
    gallery: [], galleryTotal: 2, loadingMore: false, addons: [],
    paymentSummary: { packageAmount: 3500, amountPaid: 500 },
    onLoadMore() {}, onSubmitted: async () => undefined,
  }))
}

test('submitted portal first render uses the studio timezone on both server and client', t => {
  const previousTimezone = process.env.TZ
  t.after(() => { if (previousTimezone === undefined) delete process.env.TZ; else process.env.TZ = previousTimezone })

  process.env.TZ = 'UTC'
  const serverMarkup = render()
  for (const timezone of ['Asia/Manila', 'America/Los_Angeles', 'Pacific/Auckland']) {
    process.env.TZ = timezone
    assert.equal(render(), serverMarkup, `${timezone} must hydrate the same submitted banner as the UTC server`)
  }
  assert.match(serverMarkup, /10\/1\/2026, 1:02:30 AM/)
  assert.match(serverMarkup, /Your selection is submitted and locked/)
})
