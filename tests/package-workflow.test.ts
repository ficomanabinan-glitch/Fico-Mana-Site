import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { GraduationWorkflowOnlyError, includedPrintCategories, usesGraduationWorkflow, usesOnsiteWorkflow } from '../lib/package-workflow.ts'
import { assertGraduationBooking, assertOnsiteBooking, graduationBookingIds, graduationPackageIds, onsitePackageIds, packageUsesGraduationWorkflow, packageUsesOnsiteWorkflow } from '../lib/package-workflow-server.ts'
import * as packageWorkflowServer from '../lib/package-workflow-server.ts'
import * as bookingDb from '../lib/booking-db.ts'
import { loadTs } from './helpers/load-ts.ts'

test('all managed package categories use onsite delivery; self-portrait skips editor selection', () => {
  for (const category of ['graduation', 'capping-pinning', 'creative']) {
    assert.equal(usesOnsiteWorkflow(category), true)
    assert.equal(usesGraduationWorkflow(category), true)
  }
  assert.equal(usesOnsiteWorkflow('self-portrait'), true)
  assert.equal(usesGraduationWorkflow('self-portrait'), false)
  for (const category of ['FICO PACKAGE', 'fico-package', 'Graduation', '', null, undefined]) {
    assert.equal(usesOnsiteWorkflow(category), false)
    assert.equal(usesGraduationWorkflow(category), false)
  }
  assert.deepEqual([...includedPrintCategories('graduation')], ['TOGA_PICTURE_4R', 'ALAMPAY_BARONG_4R', 'FRAME_8R', 'WALLET_SIZE'])
  assert.deepEqual([...includedPrintCategories('capping-pinning')], ['TOGA_PICTURE_4R', 'ALAMPAY_BARONG_4R', 'FRAME_8R'])
  assert.deepEqual([...includedPrintCategories('creative')], ['TOGA_PICTURE_4R', 'ALAMPAY_BARONG_4R'])
  assert.deepEqual([...includedPrintCategories('self-portrait')], [])
})

type Row = Record<string, unknown>
function mockAdmin(tables: Record<string, Row[]>, failedTable = '') {
  const reads: string[] = []
  const writes: { table: string; action: string }[] = []
  const client = { from(table: string) {
    reads.push(table)
    let rows = (tables[table] ||= []), start = 0, end = Infinity
    let mutation: { action: 'update' | 'insert'; value: Row } | null = null
    const result = () => {
      if (mutation) {
        writes.push({ table, action: mutation.action })
        if (mutation.action === 'update') for (const row of rows) Object.assign(row, mutation.value)
        else (tables[table] ||= []).push(mutation.value)
        mutation = null
      }
      return { data: rows.slice(start, end + 1), error: failedTable === table ? { message: 'Synthetic failure' } : null }
    }
    const query = {
      select: (_fields: string) => { assert.ok(_fields); return query },
      eq: (column: string, value: unknown) => { rows = rows.filter(row => row[column] === value); return query },
      in: (column: string, values: unknown[]) => { rows = rows.filter(row => values.includes(row[column])); return query },
      is: (column: string, value: unknown) => { rows = rows.filter(row => (row[column] ?? null) === value); return query },
      update: (value: Row) => { mutation = { action: 'update', value }; return query },
      insert: (value: Row) => { mutation = { action: 'insert', value }; return query },
      order: (_column: string) => { assert.ok(_column); return query },
      range: (from: number, to: number) => { start = from; end = to; return query },
      maybeSingle: async () => { const current = result(); return { data: current.data[0] || null, error: current.error } },
      single: async () => { const current = result(); return { data: current.data[0] || null, error: current.error || current.data.length !== 1 ? { message: 'Synthetic failure' } : null } },
      then: (resolve: (value: unknown) => void) => resolve(result()),
    }
    return query
  } }
  return { admin: client as unknown as Parameters<typeof packageUsesGraduationWorkflow>[0], reads, writes }
}

const tables = {
  packages: [
    { id: 'custom-grad', category: 'graduation', is_active: true },
    { id: 'archived-grad', category: 'graduation', is_active: false },
    { id: 'fico-package', category: 'self-portrait', is_active: true },
    { id: 'creative-package', category: 'creative', is_active: true },
    { id: 'pinning-package', category: 'capping-pinning', is_active: true },
  ],
  bookings: [
    { id: 'B1', package_id: 'custom-grad', workspace_id: 'studio' },
    { id: 'B2', package_id: 'fico-package', workspace_id: 'studio' },
    { id: 'B3', package_id: 'archived-grad', workspace_id: 'studio' },
    { id: 'B4', package_id: 'custom-grad', workspace_id: 'other' },
    { id: 'B5', package_id: 'pinning-package', workspace_id: 'studio' },
  ],
}

test('managed categories override seeded IDs, support custom packages, and retain archived graduation bookings', async () => {
  const { admin } = mockAdmin(tables)
  assert.equal(await packageUsesGraduationWorkflow(admin, 'custom-grad'), true)
  assert.equal(await packageUsesGraduationWorkflow(admin, 'archived-grad'), true)
  assert.equal(await packageUsesGraduationWorkflow(admin, 'fico-package'), false)
  assert.equal(await packageUsesGraduationWorkflow(admin, 'pinning-package'), true)
  assert.equal(await packageUsesOnsiteWorkflow(admin, 'fico-package'), true)
  assert.equal(await packageUsesGraduationWorkflow(admin, 'unknown'), false)
  assert.deepEqual(await graduationPackageIds(admin), ['custom-grad', 'archived-grad', 'creative-package', 'pinning-package'])
  assert.deepEqual(await onsitePackageIds(admin), ['custom-grad', 'archived-grad', 'fico-package', 'creative-package', 'pinning-package'])
  assert.deepEqual([...(await graduationBookingIds(admin, 'studio', ['B1', 'B2', 'B3', 'B4', 'B5']))], ['B1', 'B3', 'B5'])
  await assertOnsiteBooking(admin, 'B2', 'studio')
})

test('manual generation requires a matching workspace booking and a graduation category', async () => {
  const { admin } = mockAdmin(tables)
  await assertGraduationBooking(admin, 'B1', 'studio')
  await assert.rejects(assertGraduationBooking(admin, 'B2', 'studio'), GraduationWorkflowOnlyError)
  await assert.rejects(assertGraduationBooking(admin, 'B4', 'studio'))
  await assert.rejects(assertGraduationBooking(admin, 'missing', 'studio'))
})

test('unavailable package rules fail closed without falling back to a package name or seed', async () => {
  const { admin } = mockAdmin(tables, 'packages')
  await assert.rejects(packageUsesGraduationWorkflow(admin, 'custom-grad'))
  await assert.rejects(graduationPackageIds(admin))
  await assert.rejects(assertGraduationBooking(admin, 'B1', 'studio'))
})

test('graduation package lookup paginates rather than dropping custom packages after 1000 rows', async () => {
  const { admin } = mockAdmin({ packages: Array.from({ length: 1005 }, (_, index) => ({ id: `grad-${index}`, category: 'graduation' })) })
  assert.equal((await graduationPackageIds(admin)).length, 1005)
})

test('self-portrait provisioning prepares storage but not a client portal before upload', async () => {
  const booking = { id: 'SELF-TEST', workspace_id: 'studio', package_id: 'self-custom', package_name: 'Sample Self Portrait',
    customer_name: 'Synthetic client', booking_date: '2026-09-09', booking_status: 'Pending Payment', payment_status: 'Unpaid', price: 350, deposit_amount: 0 }
  const { admin, writes, reads } = mockAdmin({
    packages: [{ id: 'self-custom', category: 'self-portrait' }], bookings: [booking],
    payments: [{ booking_id: booking.id, status: 'confirmed', amount: 350 }],
  })
  const provisioning = loadTs<typeof import('../lib/booking-provisioning.ts')>('lib/booking-provisioning.ts', {
    '@/lib/booking-db': bookingDb,
    '@/lib/storage/storage-keys': { bookingStoragePrefix: () => 'studio/self-test' },
    '@/lib/client-portal': {}, '@/lib/portal-expiry': { hasPortalExpired: () => false },
    '@/lib/portal-email': { sendPortalAccessIfNeeded: async () => { throw new Error('Unexpected portal email') } },
    '@/lib/supabase/admin': { getSupabaseAdmin: () => admin },
    '@/lib/package-workflow-server': packageWorkflowServer,
  })
  assert.ok(await provisioning.provisionBookingResources(booking.id))
  assert.equal(booking.booking_status, 'Confirmed')
  assert.equal(booking.payment_status, 'Paid Full')
  assert.equal(reads.includes('booking_provisioning'), true)
  const snapshot = await provisioning.getProvisioningSnapshot(booking.id)
  assert.equal(snapshot?.storageStatus, 'ready')
  assert.equal(snapshot?.confirmedPayments, 350)
  assert.equal(writes.some(write => write.table === 'client_portals'), false)
})

test('all resource creation paths are guarded while ordinary payment confirmation remains before the skip', async () => {
  const provisioning = await readFile('lib/booking-provisioning.ts', 'utf8')
  const editor = await readFile('lib/editor-workflow.ts', 'utf8')
  const overview = await readFile('app/api/provisioning/route.ts', 'utf8')
  const email = await readFile('lib/portal-email.ts', 'utf8')
  const provision = provisioning.slice(provisioning.indexOf('export async function provisionBookingResources'), provisioning.indexOf('export async function disableClientPortal'))
  const skip = provision.indexOf('if (!requiresPhotoWorkflow || !row) return null')
  assert.ok(skip > provision.indexOf(".update({ booking_status: 'Confirmed'"))
  assert.ok(skip < provision.indexOf('storagePrefix = bookingStoragePrefix'))
  assert.equal(provision.includes('const ensuredPortal = await ensurePortal'), false)
  assert.match(provision, /first completed onsite upload activates the portal/i)
  assert.match(provision, /requiresPhotoWorkflow \? await getProvisioningRow\(admin, bookingId\) : null/)
  const snapshot = provisioning.slice(provisioning.indexOf('export async function getProvisioningSnapshot'), provisioning.indexOf('export async function provisionBookingResources'))
  assert.ok(snapshot.indexOf('packageUsesOnsiteWorkflow') < snapshot.indexOf('getProvisioningRow('))
  assert.match(editor, /async function ensurePortal\([^]+?\{\s*await assertOnsiteBooking\(admin, bookingId, workspaceId\)/)
  assert.match(editor, /export async function ensureBookingStorage\([^]+?\{\s*await assertOnsiteBooking\(admin, bookingId, workspaceId\)/)
  const repair = editor.slice(editor.indexOf('export async function reconcileBookingStorage'), editor.indexOf('export async function saveRawFile'))
  assert.ok(repair.indexOf('assertOnsiteBooking') < repair.indexOf('if (repair)'))
  assert.match(editor, /\.in\('package_id', eligiblePackageIds\)/)
  assert.match(editor, /bookingMap.has\(String\(job.booking_id\)\)/)
  assert.match(overview, /onsitePackageIds\(admin\)/)
  assert.match(overview, /\.in\('package_id', eligiblePackageIds/)
  assert.ok(email.indexOf('packageUsesOnsiteWorkflow(admin') < email.indexOf('await sendEmail('))
})
