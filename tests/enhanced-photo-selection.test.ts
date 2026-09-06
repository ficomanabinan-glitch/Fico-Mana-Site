import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  clientSelectionStatusSchema,
  editorBatchUploadStartSchema,
  portalSelectionSchema,
} from '../lib/security/schemas.ts'

const ids = Array.from({ length: 10 }, (_, index) =>
  `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
)

const validSelection = {
  fileIds: ids.slice(0, 6),
  includedFileIds: ids.slice(0, 5),
  extraEditFileIds: [ids[5]],
  preferences: ids.slice(0, 6).map((fileId) => ({ fileId, preference: 'standard' as const })),
  printAllocations: [
    { category: 'TOGA_PICTURE_4R' as const, fileId: ids[0], quantity: 1 },
    { category: 'ALAMPAY_BARONG_4R' as const, fileId: ids[1], quantity: 1 },
    { category: 'FRAME_8R' as const, fileId: ids[2], quantity: 1 },
    { category: 'WALLET_SIZE' as const, fileId: ids[3], quantity: 4 },
  ],
  addons: [{ addonId: ids[9], quantity: 1, photoCount: 1 }],
  acknowledgeNoRevision: true,
}

test('enhanced selection accepts five included photos and an optional extra edit', () => {
  assert.equal(portalSelectionSchema.safeParse(validSelection).success, true)
})

test('enhanced selection input is bounded and rejects unknown print categories', () => {
  assert.equal(
    portalSelectionSchema.safeParse({ ...validSelection, includedFileIds: ids.slice(0, 6) }).success,
    false,
  )
  assert.equal(
    portalSelectionSchema.safeParse({
      ...validSelection,
      printAllocations: [
        ...validSelection.printAllocations,
        { category: 'UNKNOWN_PRINT', fileId: ids[4], quantity: 1 },
      ],
    }).success,
    false,
  )
  assert.equal(
    portalSelectionSchema.safeParse({
      ...validSelection,
      addons: ids.slice(0, 5).map((addonId) => ({ addonId, quantity: 1, photoCount: 0 })),
    }).success,
    false,
  )
})

test('all required client workflow statuses are accepted and arbitrary values are rejected', () => {
  const statuses = ['Not Started', 'Selection In Progress', 'Submitted', 'Editing', 'Ready for Printing', 'Ready for Release', 'Released']
  for (const status of statuses) assert.equal(clientSelectionStatusSchema.safeParse({ status }).success, true)
  assert.equal(clientSelectionStatusSchema.safeParse({ status: 'Approved' }).success, false)
})

test('the database migration is service-only, tenant-scoped, and preserves submitted price snapshots', async () => {
  const [migration, workflow] = await Promise.all([
    readFile('supabase/migrations/20260907120000_enhanced_photo_selection_workflow.sql', 'utf8'),
    readFile('lib/editor-workflow.ts', 'utf8'),
  ])
  assert.match(migration, /workspace_id uuid not null references public\.workspaces\(id\)/i)
  assert.match(migration, /name_snapshot text not null/i)
  assert.match(migration, /unit_price_snapshot numeric\(12,2\) not null/i)
  assert.match(migration, /TOGA_PICTURE_4R/)
  assert.match(workflow, /TOGA PICTURE - 4R/)
  assert.match(migration, /enable row level security/i)
  assert.match(migration, /revoke all on public\.addon_catalog, public\.client_addon_orders, public\.print_allocations from anon, authenticated/i)
  assert.match(migration, /grant all on public\.addon_catalog, public\.client_addon_orders, public\.print_allocations to service_role/i)
})

test('submission logic validates booking ownership, acknowledgement, print limits, and duplicate locking', async () => {
  const source = await readFile('lib/editor-workflow.ts', 'utf8')
  assert.match(source, /if \(!input\.acknowledgeNoRevision\)/)
  assert.match(source, /\.in\('status', \['OPEN', 'COPY_FAILED'\]\)/)
  assert.match(source, /This selection is already submitted and locked/)
  assert.match(source, /\.eq\('booking_id', bookingId\)\s*\.in\('id', unique\)/)
  assert.match(source, /Free print allocations must use an included enhanced photo/)
  assert.match(source, /Add Extra Edit for every photo selected beyond the included allocation/)
})

test('edited upload validation uses the actual dropped folder count instead of the package selection limit', async () => {
  assert.equal(editorBatchUploadStartSchema.safeParse({
    clients: [{ bookingId: 'FICO-2026-0001', expectedFiles: 27 }],
  }).success, true)
  assert.equal(editorBatchUploadStartSchema.safeParse({
    clients: [{ bookingId: 'FICO-2026-0001', expectedFiles: 0 }],
  }).success, false)
  const workflow = await readFile('lib/editor-workflow.ts', 'utf8')
  assert.match(workflow, /expected_files: expectedByBooking\.get/)
  assert.match(workflow, /\.from\('batch_upload_files'\)[\s\S]*?\.eq\('upload_item_id', item\.id\)/)
})
