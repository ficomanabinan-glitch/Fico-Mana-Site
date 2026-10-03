import assert from 'node:assert/strict'
import test from 'node:test'
import { existsSync, readFileSync } from 'node:fs'
import { loadTs } from './helpers/load-ts.ts'
import { mapDbBookingToModel } from '../lib/booking-db.ts'
import { bookingMutationSchema } from '../lib/security/schemas.ts'
import type { Booking } from '../lib/data-store.ts'
import { bookingWriteFields, toBookingWritePayload } from '../lib/booking-write-payload.ts'
import { z } from 'zod'

const row = { id: 'FM-203904', client_id: '11111111-1111-4111-8111-111111111111', customer_name: 'Synthetic Verification Client',
  customer_email: 'verification@example.test', customer_phone: '09170000001', package_id: 'fico-synthetic',
  package_name: 'Synthetic FICO Package', booking_date: '2026-10-04', booking_time: 'Available Time: 8:00 AM - 4:00 PM',
  arrival_time: '8:00 AM - 4:00 PM', deposit_amount: 500, price: 3500, booking_status: 'Pending Verification',
  payment_status: 'Pending Verification', created_at: '2026-10-03T01:00:00Z',
  receipt_url: '/api/receipts/22222222-2222-4222-8222-222222222222',
  payment_history: [{ id: 'PAY-TEST', type: 'Deposit', method: 'BPI', amount: 500, date: '2026-10-03T01:00:00Z' }] }

function fixture(dataStoreSource?: string, schema: z.ZodType = bookingMutationSchema) {
  const prior = mapDbBookingToModel(row), writes: Booking[] = [], emails: string[] = []
  const routeStubs: Record<string, unknown> = {
    'next/server': { NextResponse: { json: Response.json } },
    '@/lib/server-store': {}, '@/lib/supabase/env': { isSupabaseConfigured: () => true },
    '@/lib/supabase/admin': { getSupabaseAdmin: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: row.package_id, title: row.package_name, category: 'graduation', slot_type: 'standard', is_active: true, price_amount: 3500, selection_limit: 5 } }) }) }) }) }) },
    '@/lib/auth-api': { requireStaffAuth: async () => ({ user: { id: 'synthetic-staff' }, error: null }) },
    '@/lib/supabase-store': { getBookingFromDb: async () => prior, saveBookingToDb: async (_db: unknown, booking: Booking) => {
      writes.push(booking); return { ...booking, clientId: prior.clientId }
    } },
    '@/lib/booking-db': { mapDbPackageRow: (pkg: any) => ({ ...pkg, price: '₱3,500', priceAmount: 3500, slotType: 'standard', isActive: true, features: [] }) },
    '@/lib/booking-validate': { validateBookingAvailability: () => ({ ok: true }) },
    '@/lib/server-blocked-slots': { listBlockedSlots: async () => [] },
    '@/lib/server-fico-spot-blocks': { listFicoSpotBlocks: async () => [] }, '@/lib/db-sync': {},
    '@/lib/email': { sendDepositApprovedEmails: async () => { emails.push('approved'); return { success: true } },
      sendPaymentRejectedEmail: async () => { emails.push('rejected'); return { success: true } } },
    '@/lib/customer-email': {}, '@/lib/booking-packages': { getBookingPackage: () => null, bookingPackageRequiresDeposit: () => true, packageUsesMakeupSlots: () => false },
    '@/lib/booking-slots': { FICO_BOOKING_TIME_LABEL: row.booking_time, FICO_ARRIVAL_LABEL: row.arrival_time },
    '@/lib/booking-provisioning': { recordConfirmedPayment: async () => {}, provisionBookingResources: async () => ({ ready: true }) },
    '@/lib/supabase/server': { getAdminAuthContext: async () => ({ user: { id: 'synthetic-staff' } }) },
    '@/lib/security/api-rate-limit': { API_RATE_LIMITS: {}, enforceApiRateLimit: async () => null },
    '@/lib/security/request-security': { rejectUntrustedMutation: () => null },
    '@/lib/security/schemas': { bookingMutationSchema: schema },
    '@/lib/studio-cash-discount': { validateCashDiscountMutation: () => true },
    '@/lib/security/security-audit': { recordSecurityAuditEvent: async () => {} }, '@/lib/security/error-response': {},
  }
  const route = loadTs<typeof import('../app/api/bookings/route.ts')>('app/api/bookings/route.ts', routeStubs)
  const bodies: unknown[] = []
  const previousFetch = globalThis.fetch
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)); bodies.push(body)
    return route.POST(new Request('https://admin.ficomana.com/api/bookings', { method: 'POST', body: JSON.stringify(body) }))
  }
  const payloadPath = 'lib/booking-write-payload.ts'
  const store = loadTs<typeof import('../lib/data-store.ts')>('lib/data-store.ts', {
    './booking-packages': { bookingPackages: [] }, './sales-read-cache': { signalSalesDataChanged: () => {} },
    './admin-cache-policy.ts': { STAFF_READ_FRESH_MS: 30000 }, './booking-db': {},
    './booking-write-payload.ts': existsSync(payloadPath) ? loadTs(payloadPath, {}) : {},
  }, dataStoreSource)
  return { prior, store, bodies, writes, emails, restore: () => { globalThis.fetch = previousFetch } }
}

test('approval round-trips a Client360-linked booking without sending read-only metadata', async () => {
  const f = fixture()
  try {
    const result = await f.store.saveBooking({ ...f.prior, provisioning: { ready: true }, bookingStatus: 'Confirmed', paymentStatus: 'Paid Deposit' })
    assert.equal(result.booking.bookingStatus, 'Confirmed')
    assert.equal(result.booking.clientId, row.client_id)
    assert.equal(f.writes.length, 1)
    assert.equal(Object.hasOwn(f.writes[0], 'clientId'), false)
    assert.equal(Object.hasOwn(f.writes[0], 'provisioning'), false)
    assert.deepEqual(f.emails, ['approved'])
  } finally { f.restore() }
})

test('ordinary and forged rejection save the reason and preserve or clear the receipt intentionally', async () => {
  for (const forged of [false, true]) {
    const f = fixture()
    try {
      const result = await f.store.saveBooking({ ...f.prior, bookingStatus: 'Pending Payment', paymentStatus: 'Unpaid',
        rejectionReasonId: forged ? 'forged' : 'blurry', rejectionReason: 'Synthetic receipt requires replacement.',
        receiptUrl: forged ? '' : f.prior.receiptUrl, transactionRef: forged ? '' : 'SYNTHETIC-REF',
        paymentHistory: forged ? [] : f.prior.paymentHistory })
      assert.equal(result.booking.bookingStatus, 'Pending Payment')
      assert.equal(result.booking.clientId, row.client_id)
      assert.equal(f.writes[0].receiptUrl, forged ? '' : row.receipt_url)
      assert.equal(f.writes[0].rejectionReasonId, forged ? 'forged' : 'blurry')
      assert.equal(f.writes[0].paymentHistory.length, forged ? 0 : 1)
      assert.deepEqual(f.emails, ['rejected'])
    } finally { f.restore() }
  }
})

test('public validation still rejects privileged metadata, arbitrary receipt URLs and invalid booking fields', () => {
  const payload = toBookingWritePayload(mapDbBookingToModel(row))
  assert.equal(bookingMutationSchema.safeParse(payload).success, true)
  for (const changed of [{ role: 'owner' }, { clientId: row.client_id }, { provisioning: {} }, { receiptUrl: 'https://attacker.invalid/receipt' }, { price: -1 }]) {
    assert.equal(bookingMutationSchema.safeParse({ ...payload, ...changed }).success, false)
  }
})

test('write projection exactly matches strict schema and keeps all writable values including clears', () => {
  assert.deepEqual([...bookingWriteFields].sort(), Object.keys(bookingMutationSchema.shape).sort())
  const values = Object.fromEntries(bookingWriteFields.map(key => [key, `synthetic-${key}`]))
  const payload = toBookingWritePayload({ ...values, receiptUrl: '', discountAmount: 0, isWalkIn: false,
    clientId: row.client_id, provisioning: {}, emailErrors: [] } as unknown as Booking)
  assert.deepEqual(Object.keys(payload).sort(), [...bookingWriteFields].sort())
  assert.equal(payload.receiptUrl, '')
  assert.equal(payload.discountAmount, 0)
  assert.equal(payload.isWalkIn, false)
  assert.equal(payload.staffNotes, values.staffNotes)
})

test('ten isolated regression cycles fail without each fix and pass with the implemented fixes', async () => {
  const source = readFileSync('lib/data-store.ts', 'utf8')
  const oldSource = source.replace('JSON.stringify(toBookingWritePayload(booking))', 'JSON.stringify(booking)')
  assert.notEqual(source, oldSource)
  const oldSchema = bookingMutationSchema.extend({ receiptUrl: z.string().trim().regex(/^\/api\/receipts\/[0-9a-f-]{36}$/i).max(100).optional() })
  for (let run = 0; run < 10; run++) {
    const withoutProjection = fixture(oldSource)
    try {
      await assert.rejects(withoutProjection.store.saveBooking({ ...withoutProjection.prior, bookingStatus: 'Confirmed' }), /Some reservation details/)
      assert.equal(withoutProjection.writes.length, 0)
    } finally { withoutProjection.restore() }
    const withoutClear = fixture(undefined, oldSchema)
    try {
      await assert.rejects(withoutClear.store.saveBooking({ ...withoutClear.prior, receiptUrl: '' }), /receipt uploaded/)
      assert.equal(withoutClear.writes.length, 0)
    } finally { withoutClear.restore() }
    const fixed = fixture()
    try {
      assert.equal((await fixed.store.saveBooking({ ...fixed.prior, bookingStatus: 'Pending Payment', receiptUrl: '',
        rejectionReason: 'Synthetic forged receipt.', rejectionReasonId: 'forged', paymentHistory: [] })).booking.bookingStatus, 'Pending Payment')
      assert.equal(fixed.writes.length, 1)
    } finally { fixed.restore() }
  }
})

test('verification confirmations do not use browser dialogs', () => {
  assert.doesNotMatch(readFileSync('app/admin/verification/page.tsx', 'utf8'), /window\.(?:confirm|alert)\(/)
})
