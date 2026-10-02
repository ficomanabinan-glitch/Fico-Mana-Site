import assert from 'node:assert/strict'
import test from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { loadTs } from './helpers/load-ts.ts'
import * as workflow from '../lib/workflow-next-action.ts'
import * as navigation from '../lib/client-workspace-navigation.ts'
import * as summary from '../lib/client-selection-summary.ts'
import * as drafts from '../lib/portal-selection-draft.ts'
import * as selectionNavigation from '../lib/selection-step-navigation.ts'
import type { PortalData } from '../components/client-portal-page.tsx'

const Empty = () => null
const Wrapper = ({ children }: any) => children
const noWrite = () => { throw new Error('Status render checks must not write or read services.') }
const Link = ({ children, href }: any) => React.createElement('a', { href }, children)

const selection = loadTs<any>('components/client-photo-selection.tsx', {
  '@/components/portal-photo-preview': { PortalPhotoPreview: Empty },
  '@/components/portal-photo-contact-sheet': Empty,
  '@/components/portal-print-picker': { default: Empty, portalPrintOptions: () => [] },
  '@/components/portal-addon-picker': Empty, '@/components/portal-review': Empty,
  '@/components/password-visibility-toggle': { PasswordVisibilityToggle: Empty },
  '@/components/portal-workspace.module.css': {},
  '@/components/admin-toast-provider': { useAdminToast: () => ({ success: noWrite }) },
  '@/lib/client-selection-summary': summary, '@/lib/portal-selection-draft': drafts,
  '@/lib/selection-step-navigation': selectionNavigation,
  '@/lib/private-attachment-download': { startPrivateAttachmentDownload: noWrite },
  '@/components/ui/sheet': { Sheet: Empty, SheetContent: Empty, SheetHeader: Empty, SheetTitle: Empty, SheetDescription: Empty },
})
const portal = loadTs<any>('components/client-portal-page.tsx', {
  '@tanstack/react-query': { useQueryClient: () => ({ setQueryData: noWrite, getQueryData: noWrite }) },
  'next/link': Link, '@/components/portal-qr-code': Empty, '@/components/portal-overview': Wrapper,
  '@/components/portal-workspace.module.css': {}, '@/components/portal-expiry-notice': Empty,
  '@/components/portal-deliverable-gallery': Empty, '@/components/portal-edited-download': Empty,
  '@/components/portal-original-download': Empty, '@/components/portal-page-skeleton': Empty,
  '@/components/portal-preview-cache': { PortalPreviewProvider: Wrapper },
  '@/components/use-portal-photo-sync': { usePortalPhotoSync: () => {} },
  '@/lib/portal-access-denial': { isPortalAccessDenied: noWrite },
  '@/lib/portal-selection-draft': drafts, '@/lib/client-selection-summary': summary,
  '@/components/client-photo-selection': selection,
})

function portalData(editingStatus: string, status: NonNullable<PortalData['selection']>['status'] = 'SUBMITTED'): PortalData {
  return {
    booking: { id: 'FM-SYNTHETIC', customerName: 'Synthetic Client', packageName: 'Synthetic Package',
      packageCategory: 'pinning', bookingDate: '2026-10-01', bookingTime: '09:00', bookingStatus: 'CONFIRMED',
      paymentStatus: 'PAID_DEPOSIT', price: 3500, depositAmount: 500, amountPaid: 500 },
    portalId: 'synthetic', shareUrl: '/portal/synthetic', expiry: null,
    selection: { id: 'synthetic', status,
      requiredCount: 2, includedLimit: 2, clientStatus: 'submitted', noRevisionAcknowledged: true,
      selectedIds: ['a', 'b'], selectedItems: [{ fileId: 'a', preference: 'standard', extraEdit: false },
        { fileId: 'b', preference: 'standard', extraEdit: false }], printAllocations: [], addonOrders: [], totalAddonAmount: 0 },
    gallery: [], selectedGallery: [], galleryTotal: 2, rawDownloadBytes: 0, galleryOffset: 0, galleryLimit: 48,
    editingStatus, addonCatalog: [], deliverables: [], resources: [], downloadAllUrl: '/synthetic',
    rawDownloadAllUrl: null, rawDownloadRequestUrl: null, rawDownloadAccess: null,
  }
}
const renderPortal = (data: PortalData) => renderToStaticMarkup(React.createElement(portal.default, { publicId: 'synthetic', initialData: data }))

test('locked selection and delivered production render as separate facts in overview and banner', () => {
  const markup = renderPortal(portalData('DELIVERED'))
  assert.match(markup, /<dt>Project status<\/dt><dd>Edited photos delivered<\/dd>/)
  assert.match(markup, /Project status: Edited photos delivered\./)
  assert.match(markup, /<dt>Photo selection<\/dt><dd>Selection submitted · Locked<\/dd>/)
  assert.match(markup, /Your selection is submitted and locked/)
  assert.doesNotMatch(markup, /<dt>Project status<\/dt><dd>Selection submitted/)
  assert.match(markup, /<dt>Booking<\/dt><dd>Confirmed<\/dd>/)
  assert.match(markup, /<dt>Status<\/dt><dd>Paid deposit<\/dd>/)
})

test('each production status uses the same human label in project summary and locked banner', () => {
  const cases = { WAITING_FOR_SELECTION: 'Waiting for your selection', READY_FOR_EDITING: 'Ready for editing',
    DOWNLOADED: 'Preparing for editing', EDITING: 'Editing in progress', READY_TO_UPLOAD: 'Ready to upload edited photos',
    UPLOADING: 'Uploading edited photos', UPLOAD_FAILED: 'Edited photo upload needs attention' }
  for (const [status, label] of Object.entries(cases)) {
    const markup = renderPortal(portalData(status))
    assert.ok(markup.includes(`<dt>Project status</dt><dd>${label}</dd>`), status)
    assert.ok(markup.includes(`Project status: ${label}.`), status)
    assert.doesNotMatch(markup, /Edited photos delivered/)
  }
  assert.match(renderPortal(portalData('EDITING', 'SUBMITTING')), /Submission in progress · Locked/)
})

test('recorded release survives stale production while unavailable production never becomes selection waiting', () => {
  const stale = portalData('READY_FOR_EDITING')
  stale.expiry = { days: 30, expiresAt: null, portalReadyEmailSentAt: null, deliverablesUploadedAt: '2026-10-01T03:00:00Z' }
  assert.match(renderPortal(stale), /<dt>Project status<\/dt><dd>Edited photos delivered<\/dd>/)
  const unavailable = portalData('WAITING_FOR_SELECTION')
  unavailable.warnings = ['editing status']
  assert.match(renderPortal(unavailable), /<dt>Project status<\/dt><dd>Not available<\/dd>/)
  assert.doesNotMatch(renderPortal(unavailable), /Waiting for your selection/)
})

test('workspace renders recorded editing milestone and current task without claiming earlier completion', () => {
  const fixture = loadTs<any>('e2e/fixtures/client-workspace.ts', { '@playwright/test': { test: { extend: () => ({}) }, expect: noWrite } })
  const core = fixture.workspaceCore(), details = fixture.workspaceDetails()
  core.booking.rawPhotoStatus = null; core.booking.rawPhotoSubmittedAt = null; core.booking.rawPhotoApprovedAt = null
  details.sections.selection = { status: 'unavailable', data: null }
  let state = 0
  const workspace = loadTs<any>('components/client-workspace.tsx', {
    react: { ...React, useEffect: () => {}, useState: () => [[true, core, details, '', '', 0, 0, ''][state++], noWrite] },
    'next/link': Link, 'next/navigation': { useRouter: () => ({ push: noWrite }) },
    '@/lib/admin-ui': {}, '@/lib/workflow-next-action': workflow,
    '@/lib/client-workspace-navigation': navigation, '@/lib/new-admin/presentation-data': { studioDay: () => '2026-10-02' },
    '@/components/production-milestones': Empty,
  })
  const markup = renderToStaticMarkup(React.createElement(workspace.default, { clientId: core.client.id }))
  assert.match(markup, /aria-current="step"[^]*?7\. Editing/)
  assert.match(markup, /Current task · Open editing batch/)
  assert.match(markup, /An editing-start milestone is recorded\. Current job status: READY_FOR_EDITING/)
  assert.doesNotMatch(markup, /editing has not started|choices are approved/)
  assert.match(markup, /Staff approval status is unavailable/)
  assert.match(markup, /Final release has not been recorded/)
})
