import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './helpers/load-ts.ts'

function fixture(options: { foreign?: boolean; inactive?: boolean; empty?: boolean; sent?: boolean; failure?: boolean; readError?: boolean } = {}) {
  const calls: Array<{ table: string; filters: Record<string, unknown> }> = []
  const sends: any[] = []
  const admin = { from(table: string) {
    const filters: Record<string, unknown> = {}
    calls.push({ table, filters })
    const q: any = {
      select: () => q, eq: (key: string, value: unknown) => { filters[key] = value; return q },
      limit: () => q, maybeSingle: () => q, update: () => q,
      then(resolve: (result: unknown) => void) {
        const data = table === 'bookings' ? (options.foreign ? null : {
          id: 'ONE', customer_name: '<b>Client</b>', customer_email: 'client@example.com', package_id: 'grad', booking_status: 'Confirmed',
        }) : table === 'client_portals' ? { id: 'portal', public_id: 'public', status: options.inactive ? 'disabled' : 'active' }
          : table === 'gallery_files' ? (options.empty ? [] : [{ id: 'photo' }])
          : options.sent ? [{ id: 'sent-log' }] : []
        resolve({ data, error: options.readError ? { message: 'offline' } : null })
      },
    }
    return q
  } }
  const portalModule = loadTs<typeof import('../lib/portal-email.ts')>('lib/portal-email.ts', {
    '@/lib/customer-email': { isPlaceholderCustomerEmail: () => false, isValidCustomerEmail: () => true },
    '@/lib/email': { sendEmail: async (input: any) => { sends.push(input); return { success: !options.failure } } },
    '@/lib/email-templates': { escapeEmailText: (text: string) => text.replaceAll('<', '&lt;').replaceAll('>', '&gt;') },
    '@/lib/client-portal': { portalUrl: () => 'https://www.ficomana.com/portal/private?sig=test' },
    '@/lib/package-workflow-server': { packageUsesGraduationWorkflow: async () => true },
  })
  return { calls, sends, run: () => portalModule.sendPortalAccessIfNeeded(admin as never, 'ONE', { workspaceId: 'studio', type: 'staff', id: 'staff' }) }
}

test('portal email verifies workspace ownership before reading private links or sending', async () => {
  const f = fixture({ foreign: true })
  assert.equal((await f.run()).sent, false)
  assert.deepEqual(f.calls, [{ table: 'bookings', filters: { workspace_id: 'studio', id: 'ONE' } }])
  assert.equal(f.sends.length, 0)
})

test('empty galleries, inactive portals, and read failures never send email', async () => {
  for (const options of [{ empty: true }, { inactive: true }]) {
    const f = fixture(options)
    assert.ok((await f.run()).error)
    assert.equal(f.sends.length, 0)
  }
  const f = fixture({ readError: true })
  await assert.rejects(f.run, /could not be checked/)
  assert.equal(f.sends.length, 0)
})

test('accepted emails are deduplicated; uncertain retries share the same provider key', async () => {
  const f = fixture()
  assert.equal((await f.run()).sent, true)
  await f.run()
  assert.equal(f.sends[0].idempotencyKey, f.sends[1].idempotencyKey)
  assert.match(f.sends[0].html, /&lt;b&gt;Client&lt;\/b&gt;/)
  assert.match(f.sends[0].html, /review your photos/)
  const already = fixture({ sent: true })
  assert.equal((await already.run()).alreadySent, true)
  assert.equal(already.sends.length, 0)
  const failed = fixture({ failure: true })
  assert.ok((await failed.run()).error)
  assert.equal(failed.calls.filter(call => call.table === 'client_portals').length, 1, 'Failed send never updates the sent timestamp')
})
