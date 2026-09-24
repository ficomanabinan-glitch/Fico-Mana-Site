import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { buildEmailHealthCheck, emailHealthRequest, sendEmailHealthCheck } from '../lib/email-health.ts'

const input = { to: 'owner@example.com', requestId: 'bd0c8a84-81ba-456a-a66e-16677cfe7a01' }
const from = 'FICO MANA Studio <bookings@updates.ficomana.com>'

test('test email input accepts exactly one email and a stable UUID', () => {
  assert.equal(emailHealthRequest.safeParse(input).success, true)
  for (const bad of [null, {}, { ...input, to: 'a@example.com,b@example.com' }, { ...input, to: ['a@example.com'] }, { ...input, requestId: 'unsafe' }, { ...input, html: 'injected' }, { ...input, from: 'spoof@example.com' }]) {
    assert.equal(emailHealthRequest.safeParse(bad).success, false)
  }
  assert.equal(emailHealthRequest.parse({ ...input, to: ' owner@example.com ' }).to, input.to)
})

test('retries use identical content and keys without exposing recipient or actor in the key', () => {
  const first = buildEmailHealthCheck(from, 'admin-1', input)
  assert.deepEqual(first, buildEmailHealthCheck(from, 'admin-1', input))
  for (const changed of [buildEmailHealthCheck(from, 'admin-2', input), buildEmailHealthCheck(from, 'admin-1', { ...input, to: 'another@example.com' }), buildEmailHealthCheck(from, 'admin-1', { ...input, requestId: 'ad0c8a84-81ba-456a-a66e-16677cfe7a01' })]) {
    assert.notEqual(first.options.idempotencyKey, changed.options.idempotencyKey)
  }
  assert.doesNotMatch(first.options.idempotencyKey, /owner|admin-1|@/)
})

test('provider acceptance requires an email id and is not claimed as delivery', async () => {
  const message = buildEmailHealthCheck(from, 'admin-1', input)
  let calls = 0
  const result = await sendEmailHealthCheck(message, async (payload, options) => {
    calls++
    assert.deepEqual(payload, message.payload)
    assert.deepEqual(options, message.options)
    return { data: { id: 'email-123' }, error: null }
  })
  assert.equal(calls, 1)
  assert.deepEqual(result, { success: true, deliveryStatus: 'accepted', resendId: 'email-123', to: input.to })
})

test('provider failures give useful solutions and cannot become false successes', async () => {
  const message = buildEmailHealthCheck(from, 'admin-1', input)
  for (const name of ['validation_error', 'invalid_api_key', 'rate_limit_exceeded', 'unknown']) {
    await assert.rejects(() => sendEmailHealthCheck(message, async () => ({ data: null, error: { name } })), /Try:/)
  }
  await assert.rejects(() => sendEmailHealthCheck(message, async () => ({ data: null, error: null })), /not confirm acceptance/)
  await assert.rejects(() => sendEmailHealthCheck(message, async () => { throw new Error('network down') }), /network down/)
})

test('test route keeps staff authentication, origin validation, rate limits and private responses without booking writes', async () => {
  const route = await readFile('app/api/emails/health/route.ts', 'utf8')
  assert.match(route, /requireStaffAuth\(request\)/)
  assert.match(route, /limit: 5, windowSeconds: 3600, failClosed: true/)
  assert.match(route, /privateNoStoreHeaders/)
  assert.match(route, /emailHealthRequest.safeParse/)
  assert.match(route, /resend.emails.send\(payload, options\)/)
  assert.doesNotMatch(route, /FM-HEALTHCHECK|from '@\/lib\/email'/)
  assert.match(route, /persistEmailLog/)
  assert.match(route, /providerId: result\.resendId/)
  const ui = await readFile('components/email-test-settings.tsx', 'utf8')
  assert.match(ui, /inFlight.current/)
  assert.match(ui, /JSON.stringify\(attempt.current\)/)
  assert.match(ui, /The email service accepted/)
})
