import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { GraduationWorkflowOnlyError, usesGraduationWorkflow } from '../lib/package-workflow.ts'
import { assertGraduationBooking, graduationBookingIds, graduationPackageIds, packageUsesGraduationWorkflow } from '../lib/package-workflow-server.ts'
import * as packageWorkflowServer from '../lib/package-workflow-server.ts'
import * as bookingDb from '../lib/booking-db.ts'
import { loadTs } from './helpers/load-ts.ts'

test('only the explicit Graduation category uses the remote photo workflow', () => {
  assert.equal(usesGraduationWorkflow('graduation'), true)
  for (const category of ['self-portrait', 'creative', 'capping-pinning', 'FICO PACKAGE', 'fico-package', 'Graduation', '', null, undefined]) {
    assert.equal(usesGraduationWorkflow(category), false)
  }
})

type Row = Record<string, unknown>
function mockAdmin(tables: Record<string, Row[]>, failedTable = '') {
  const reads: string[] = []
  const writes: { table: string; action: string }[] = []
  const client = { from(table: string) {
    reads.push(table)
    let rows = tables[table] || [], start = 0, end = Infinity
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
      maybeSingle: async () => ({ data: rows[0] || null, error: failedTable === table ? { message: 'Synthetic failure' } : null }),
      single: async () => ({ data: rows[0] || null, error: failedTable === table || rows.length !== 1 ? { message: 'Synthetic failure' } : null }),
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
  ],
  bookings: [
    { id: 'B1', package_id: 'custom-grad', workspace_id: 'studio' },
    { id: 'B2', package_id: 'fico-package', workspace_id: 'studio' },
    { id: 'B3', package_id: 'archived-grad', workspace_id: 'studio' },
    { id: 'B4', package_id: 'custom-grad', workspace_id: 'other' },
  ],
}

test('managed categories override seeded IDs, support custom packages, and retain archived graduation bookings', async () => {
  const { admin } = mockAdmin(tables)
  assert.equal(await packageUsesGraduationWorkflow(admin, 'custom-grad'), true)
  assert.equal(await packageUsesGraduationWorkflow(admin, 'archived-grad'), true)
  assert.equal(await packageUsesGraduationWorkflow(admin, 'fico-package'), false)
  assert.equal(await packageUsesGraduationWorkflow(admin, 'unknown'), false)
  assert.deepEqual(await graduationPackageIds(admin), ['custom-grad', 'archived-grad'])
  assert.deepEqual([...(await graduationBookingIds(admin, 'studio', ['B1', 'B2', 'B3', 'B4']))], ['B1', 'B3'])
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

test('real self-portrait provisioning confirms payment without creating a portal or photo-storage state', async () => {
  const booking = { id: 'SELF-TEST', workspace_id: 'studio', package_id: 'self-custom', package_name: 'Sample Self Portrait',
    customer_name: 'Synthetic client', booking_date: '2026-09-09', booking_status: 'Pending Payment', payment_status: 'Unpaid', price: 350, deposit_amount: 0 }
  const { admin, writes, reads } = mockAdmin({
    packages: [{ id: 'self-custom', category: 'self-portrait' }], bookings: [booking],
    payments: [{ booking_id: booking.id, status: 'confirmed', amount: 350 }],
  })
  let externalWrites = 0
  const provisioning = loadTs<typeof import('../lib/booking-provisioning.ts')>('lib/booking-provisioning.ts', {
    '@/lib/booking-db': bookingDb,
    '@/lib/storage/storage-keys': { bookingStoragePrefix: () => { externalWrites++; throw new Error('Unexpected storage creation') } },
    '@/lib/client-portal': {}, '@/lib/portal-expiry': {},
    '@/lib/portal-email': { sendPortalAccessIfNeeded: async () => { externalWrites++; throw new Error('Unexpected portal email') } },
    '@/lib/supabase/admin': { getSupabaseAdmin: () => admin },
    '@/lib/package-workflow-server': packageWorkflowServer,
  })
  assert.equal(await provisioning.provisionBookingResources(booking.id), null)
  assert.equal(booking.booking_status, 'Confirmed')
  assert.equal(booking.payment_status, 'Paid Full')
  assert.equal(externalWrites, 0)
  assert.deepEqual(writes, [{ table: 'bookings', action: 'update' }, { table: 'provisioning_audit', action: 'insert' }])
  assert.equal(reads.includes('booking_provisioning'), false)
  assert.equal(reads.includes('client_portals'), false)
  const snapshot = await provisioning.getProvisioningSnapshot(booking.id)
  assert.equal(snapshot?.required, false)
  assert.equal(snapshot?.confirmedPayments, 350)
  assert.equal(reads.includes('client_portals'), false)
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
  assert.ok(snapshot.indexOf('packageUsesGraduationWorkflow') < snapshot.indexOf('getProvisioningRow('))
  assert.match(editor, /async function ensurePortal\([^]+?\{\s*await assertGraduationBooking\(admin, bookingId, workspaceId\)/)
  assert.match(editor, /export async function ensureBookingStorage\([^]+?\{\s*await assertGraduationBooking\(admin, bookingId, workspaceId\)/)
  const repair = editor.slice(editor.indexOf('export async function reconcileBookingStorage'), editor.indexOf('export async function saveRawFile'))
  assert.ok(repair.indexOf('assertGraduationBooking') < repair.indexOf('if (repair)'))
  assert.match(editor, /\.in\('package_id', eligiblePackageIds\)/)
  assert.match(editor, /bookingMap.has\(String\(job.booking_id\)\)/)
  assert.match(overview, /graduationPackageIds\(admin\)/)
  assert.match(overview, /\.in\('package_id', eligiblePackageIds/)
  assert.ok(email.indexOf('packageUsesGraduationWorkflow(admin') < email.indexOf('await sendEmail('))
})
