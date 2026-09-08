import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import archiver from 'archiver'
import { portalExpiryNotice } from '../lib/portal-expiry.ts'
import { trackCompletedPortalDownload } from '../lib/portal-download-stream.ts'
import { loadTs } from './helpers/load-ts.ts'

const publicId = '00000000-0000-4000-8000-000000000002'

test('download stream waits for durable completion and rejects failed persistence', async () => {
  let records = 0
  let release: () => void = () => {}
  const body = new Response('sample ZIP').body!
  const result = new Response(trackCompletedPortalDownload(body, async () => {
    records++
    await new Promise<void>(resolve => { release = resolve })
  })).text()

  await new Promise(resolve => setImmediate(resolve))
  assert.equal(records, 1)
  let finished = false
  void result.then(() => { finished = true })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(finished, false)
  release()
  assert.equal(await result, 'sample ZIP')

  await assert.rejects(
    new Response(trackCompletedPortalDownload(new Response('zip').body!, async () => {
      throw new Error('database unavailable')
    })).text(),
    /database unavailable/,
  )
})

test('cancelled and failed download streams do not create a completed-download audit', async () => {
  let records = 0
  let cancelled = false
  const source = new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array([1])) },
    cancel() { cancelled = true },
  })
  const reader = trackCompletedPortalDownload(source, async () => { records++ }).getReader()
  await reader.read()
  await reader.cancel()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(records, 0)
  assert.equal(cancelled, true)

  const failed = new ReadableStream({
    start(controller) { controller.error(new Error('Drive unavailable')) },
  })
  await assert.rejects(
    new Response(trackCompletedPortalDownload(failed, async () => { records++ })).text(),
    /Drive unavailable/,
  )
  assert.equal(records, 0)
})

test('actual portal ZIP route tracks only nonempty completed client downloads, never previews', async () => {
  let records = 0
  let available = true
  let driveFailed = false
  const code = loadTs<typeof import('../app/api/editor-workflow/[...path]/route.ts')>(
    'app/api/editor-workflow/[...path]/route.ts',
    {
      archiver,
      'next/server': { NextResponse: { json: Response.json } },
      '@/lib/selection-review': {
        SelectionReviewError: class SelectionReviewError extends Error {},
        reviewSelection: async () => ({ success: true }),
      },
      '@/lib/portal-download-stream': { trackCompletedPortalDownload },
      '@/lib/editor-workflow': {
        preparePortalDeliverables: async () => available ? [{ name: 'sample.JPG', driveFileId: 'synthetic-photo' }] : [],
        recordPortalFirstDownload: async (id: string) => { assert.equal(id, publicId); records++ },
        getPortalFile: async () => ({
          data: new Uint8Array([1]),
          mimeType: 'image/jpeg',
          etag: 'sample',
          fileName: 'sample.JPG',
        }),
      },
      '@/lib/google-drive': {
        openDriveFile: async () => {
          if (driveFailed) throw new Error('Synthetic Drive failure')
          return new Response('synthetic photo bytes')
        },
      },
      '@/lib/security/api-rate-limit': { API_RATE_LIMITS: {}, enforceApiRateLimit: async () => null },
      '@/lib/package-workflow': {},
      '@/lib/auth-api': {},
      '@/lib/auth/workflow': {},
      '@/lib/security/file-validation': {},
      '@/lib/security/schemas': {},
      '@/lib/security/security-audit': {},
      '@/lib/security/upload-scanner': {},
      '@/lib/security/request-security': {},
      '@/lib/raw-upload-server': {},
      '@/lib/raw-upload-contract': {},
      '@/lib/onsite-photo-reset': {},
    },
  )

  const request = (suffix: string) => {
    const url = new URL(`https://www.ficomana.com/api/editor-workflow/portal/${publicId}/${suffix}`)
    return code.GET(
      Object.assign(new Request(url), { nextUrl: url }) as never,
      { params: Promise.resolve({ path: ['portal', publicId, ...url.pathname.split('/').slice(5)] }) },
    )
  }

  const preview = await request('file/file-id?kind=deliverable')
  await preview.arrayBuffer()
  assert.equal(records, 0)

  const zip = await request('deliverables.zip')
  assert.equal(zip.status, 200)
  const bytes = new Uint8Array(await zip.arrayBuffer())
  assert.deepEqual([...bytes.slice(0, 2)], [80, 75])
  assert.equal(records, 1)

  available = false
  assert.equal((await request('deliverables.zip')).status, 404)
  assert.equal(records, 1)

  available = true
  driveFailed = true
  await assert.rejects((await request('deliverables.zip')).arrayBuffer(), /Synthetic Drive failure/)
  assert.equal(records, 1)
})

test('expiry notice is silent before delivery and describes the exact final-gallery GMT+8 deadline afterwards', () => {
  assert.equal(portalExpiryNotice({ days: 45, portalReadyEmailSentAt: null, expiresAt: null }), '')

  const deliveredAt = '2026-09-08T00:00:00Z'
  const end = '2026-10-08T00:00:00Z'
  const notice = portalExpiryNotice(
    { days: 30, portalReadyEmailSentAt: '2026-09-01T00:00:00Z', expiresAt: end },
    Date.parse(deliveredAt),
  )
  assert.match(notice, /October 8, 2026/)
  assert.match(notice, /8:00/)
  assert.match(notice, /GMT\+8/)
  assert.match(notice, /editor delivered the finished files/i)
  assert.match(notice, /30 days remaining/)
  assert.match(
    portalExpiryNotice(
      { days: 30, portalReadyEmailSentAt: '2026-09-01T00:00:00Z', expiresAt: end },
      Date.parse(end),
    ),
    /access ended/i,
  )
})

test('final frontend and database policy gate expiry on final deliverables, never selection-ready email or first download', () => {
  const page = readFileSync('app/portal/[id]/page.tsx', 'utf8')
  assert.match(page, /const hasDeliverables = data\.deliverables\.length > 0/)
  assert.match(page, /const hasActiveExpiry = Boolean\(hasDeliverables && data\.expiry\?\.expiresAt\)/)
  assert.match(page, /hasActiveExpiry && data\.expiry \? <PortalExpiryNotice expiry=\{data\.expiry\}/)

  const email = readFileSync('lib/portal-email.ts', 'utf8')
  assert.doesNotMatch(email, /admin\.rpc\(['"]record_portal_ready_email/)
  assert.match(email, /countdown has not started/i)

  const migration = readFileSync('supabase/migrations/20260909062000_final_delivery_portal_expiry.sql', 'utf8')
  assert.match(migration, /start_portal_expiry_on_final_delivery/)
  assert.match(migration, /when \(new\.status = 'DELIVERED'\)/)
  assert.match(migration, /delivery_expiry_started_at is not null/)
  assert.match(migration, /portal_expiry_started_by_final_delivery/)
})
