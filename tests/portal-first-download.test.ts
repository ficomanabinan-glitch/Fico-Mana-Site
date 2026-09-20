import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Readable } from 'node:stream'
import test from 'node:test'
import archiver from 'archiver'
import { portalExpiryNotice } from '../lib/portal-expiry.ts'
import { trackCompletedPortalDownload } from '../lib/portal-download-stream.ts'
import { loadTs } from './helpers/load-ts.ts'

const publicId = '00000000-0000-4000-8000-000000000002'

test('download stream records only durable completion and rejects failed persistence', async () => {
  let records = 0
  let release: () => void = () => {}
  const body = new Response('sample ZIP').body!
  const result = new Response(trackCompletedPortalDownload(body, async () => {
    records++
    await new Promise<void>((resolve) => { release = resolve })
  })).text()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(records, 1)
  let finished = false
  void result.then(() => { finished = true })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(finished, false)
  release()
  assert.equal(await result, 'sample ZIP')
  await assert.rejects(
    new Response(trackCompletedPortalDownload(new Response('zip').body!, async () => { throw new Error('database unavailable') })).text(),
    /database unavailable/,
  )
})

test('cancelled and failed download streams do not record completion', async () => {
  let records = 0
  let cancelled = false
  const source = new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array([1])) },
    cancel() { cancelled = true },
  })
  const reader = trackCompletedPortalDownload(source, async () => { records++ }).getReader()
  await reader.read()
  await reader.cancel()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(records, 0)
  assert.equal(cancelled, true)
  const failed = new ReadableStream({ start(controller) { controller.error(new Error('Private storage unavailable')) } })
  await assert.rejects(new Response(trackCompletedPortalDownload(failed, async () => { records++ })).text(), /Private storage unavailable/)
  assert.equal(records, 0)
})

test('actual portal ZIP route streams R2 objects and records only a nonempty completed client download', async () => {
  let records = 0
  let available = true
  let storageFailed = false
  const code = loadTs<typeof import('../app/api/editor-workflow/[...path]/route.ts')>('app/api/editor-workflow/[...path]/route.ts', {
    archiver,
    'next/server': { NextResponse: { json: Response.json, redirect: (url: string, init: ResponseInit) => new Response(null, { ...init, headers: { ...init.headers, location: url } }) } },
    '@/lib/selection-review': { SelectionReviewError: class SelectionReviewError extends Error {}, reviewSelection: async () => ({ success: true }) },
    '@/lib/portal-download-stream': { trackCompletedPortalDownload },
    '@/lib/editor-workflow': {
      preparePortalDeliverables: async () => available ? [{ name: 'sample.JPG', storageKey: 'workspaces/studio/shoots/2026/09/14/booking/deliverable/sample.jpg' }] : [],
      recordPortalFirstDownload: async (id: string) => { assert.equal(id, publicId); records++ },
    },
    '@/lib/portal-raw-downloads': {},
    '@/lib/storage/storage-service': {
      getObject: async () => {
        if (storageFailed) throw new Error('Synthetic R2 failure')
        return { Body: Readable.from([Buffer.from('synthetic photo bytes')]) }
      },
    },
    '@/lib/security/api-rate-limit': { API_RATE_LIMITS: {}, enforceApiRateLimit: async () => null },
    '@/lib/package-workflow': {}, '@/lib/auth-api': {}, '@/lib/auth/workflow': {},
    '@/lib/security/file-validation': {}, '@/lib/security/schemas': {}, '@/lib/security/security-audit': {},
    '@/lib/security/upload-scanner': {}, '@/lib/security/request-security': {},
    '@/lib/raw-upload-server': {}, '@/lib/raw-upload-contract': {}, '@/lib/onsite-photo-reset': {},
    '@/lib/portal-page-payload': {},
  })
  const request = () => {
    const url = new URL(`https://www.ficomana.com/api/editor-workflow/portal/${publicId}/deliverables.zip`)
    return code.GET(Object.assign(new Request(url), { nextUrl: url }) as never, {
      params: Promise.resolve({ path: ['portal', publicId, 'deliverables.zip'] }),
    })
  }
  const zip = await request()
  assert.equal(zip.status, 200)
  const bytes = new Uint8Array(await zip.arrayBuffer())
  assert.deepEqual([...bytes.slice(0, 2)], [80, 75])
  assert.equal(records, 1)
  available = false
  assert.equal((await request()).status, 404)
  assert.equal(records, 1)
  available = true
  storageFailed = true
  await assert.rejects((await request()).arrayBuffer(), /Synthetic R2 failure/)
  assert.equal(records, 1)
})

test('notice shows the final-delivery start rule and the exact GMT+8 deadline afterwards', () => {
  assert.match(portalExpiryNotice({ days: 45, portalReadyEmailSentAt: null, expiresAt: null }), /45-day portal access period begins when FICO MANA releases/)
  const first = '2026-09-08T00:00:00Z'
  const end = '2026-10-08T00:00:00Z'
  const notice = portalExpiryNotice({ days: 30, portalReadyEmailSentAt: first, expiresAt: end }, Date.parse(first))
  assert.match(notice, /October 8, 2026/)
  assert.match(notice, /8:00/)
  assert.match(notice, /GMT\+8/)
  assert.match(notice, /30 days remaining/)
  assert.match(portalExpiryNotice({ days: 30, portalReadyEmailSentAt: first, expiresAt: end }, Date.parse(end)), /expired/)
})

test('delivery expiry uses the R2-only database trigger instead of an application timer', () => {
  for (const file of ['lib/editor-workflow.ts', 'lib/booking-provisioning.ts']) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /setPortalExpiryFromDelivery/)
  }
  const cleanup = readFileSync('supabase/migrations/20260914142027_remove_retired_storage_contract.sql', 'utf8')
  assert.match(cleanup, /create trigger start_portal_expiry_on_delivery[\s\S]*public\.deliverable_files/)
})
