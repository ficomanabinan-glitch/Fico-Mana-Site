import assert from 'node:assert/strict'
import test from 'node:test'
import * as crypto from 'node:crypto'
import { loadTs } from './helpers/load-ts.ts'

function setup(existing: boolean, storageUpload: () => Promise<{ error: null }>) {
  let reads = 0, audits = 0
  const callbacks: Array<() => Promise<unknown>> = []
  const admin = {
    from() {
      const query = {
        select() { reads++; return query }, eq() { return query }, insert() { return query }, update() { return query }, delete() { return query },
        maybeSingle: async () => ({ data: existing ? { id: 'existing', booking_id: 'FM-123456', storage_path: 'stored' } : null, error: null }),
        then(resolve: (value: unknown) => unknown) { return Promise.resolve({ error: null }).then(resolve) },
      }
      return query
    },
    storage: { from: () => ({ upload: storageUpload, remove: async () => ({ error: null }) }) },
  }
  const route = loadTs<{ POST: (request: Request) => Promise<Response> }>('app/api/receipts/upload/route.ts', {
    crypto,
    'next/server': { NextResponse: { json: Response.json }, after: (callback: () => Promise<unknown>) => callbacks.push(callback) },
    '@/lib/auth-api': { requireStaffAuth: async () => ({ error: null }) },
    '@/lib/booking-load': { loadBookingById: async () => null, emailsMatch: () => true },
    '@/lib/booking-id': { isValidBookingId: () => true, resolveBookingReference: (id: string) => id },
    '@/lib/supabase/admin': { getSupabaseAdmin: () => admin },
    '@/lib/supabase/env': { isSupabaseConfigured: () => true },
    '@/lib/security/api-rate-limit': { API_RATE_LIMITS: { receiptUpload: {} }, enforceApiRateLimit: async () => null },
    '@/lib/security/file-validation': { validateReceiptImageContent: async () => {} },
    '@/lib/security/request-security': { rejectUntrustedMutation: () => null, privateNoStoreHeaders: () => ({ 'cache-control': 'private, no-store' }) },
    '@/lib/security/security-audit': { recordSecurityAuditEvent: async () => { audits++ } },
    '@/lib/security/upload-scanner': { scanUpload: async () => ({ status: 'accepted' }) },
  })
  const request = () => {
    const form = new FormData()
    form.set('bookingId', 'FM-123456'); form.set('email', 'qa@example.test')
    form.set('file', new File(['synthetic boundary data'], 'receipt.jpg', { type: 'image/jpeg' }))
    return new Request('https://ficomana.com/api/receipts/upload', { method: 'POST', body: form })
  }
  return { route, request, callbacks, counts: () => ({ reads, audits }) }
}

test('receipt retry reuses one fingerprint read and does not reupload stored bytes', async () => {
  const fixture = setup(true, async () => { throw new Error('Cached receipt must not upload again') })
  const response = await fixture.route.POST(fixture.request())
  assert.equal(response.status, 200)
  assert.equal((await response.json()).receiptUrl, '/api/receipts/existing')
  assert.equal(fixture.counts().reads, 1)
})

test('new receipt confirms storage and metadata before success while audit runs after response', async () => {
  const stages: string[] = []
  const fixture = setup(false, async () => { stages.push('stored'); return { error: null } })
  const response = await fixture.route.POST(fixture.request())
  assert.equal(response.status, 200)
  assert.deepEqual(stages, ['stored'])
  assert.equal(fixture.counts().reads, 1)
  assert.equal(fixture.counts().audits, 0)
  assert.equal(fixture.callbacks.length, 1)
  await fixture.callbacks[0]()
  assert.equal(fixture.counts().audits, 1)
})
