import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { loadTs } from './helpers/load-ts.ts'
import { componentHarness, elements, content } from './helpers/component-harness.ts'
import * as schemas from '../lib/security/schemas.ts'

const id = '00000000-0000-4000-8000-000000000042'
const driveUrl = 'https://drive.google.com/drive/folders/client-raw'

function setup(initialUrl?: string) {
  const hooks = componentHarness()
  const componentModule = loadTs<typeof import('../components/portal-drive-photos.tsx')>('components/portal-drive-photos.tsx', {
    react: hooks.react,
    '@/components/ui/sheet': { Sheet: () => null, SheetContent: () => null, SheetHeader: () => null, SheetTitle: () => null, SheetDescription: () => null },
  })
  return { ...hooks, render: () => hooks.render(() => componentModule.default({ publicId: id, initialUrl })) }
}

test('verified submission link is a normal Drive navigation, never a download, popup or stored PIN', () => {
  const f = setup(driveUrl), tree = f.render()
  const link = elements(tree, el => el.type === 'a')[0]
  assert.equal(content(link), 'View All Photos')
  assert.equal(link.props.href, driveUrl)
  assert.equal(link.props.target, '_blank')
  assert.equal(link.props.rel, 'noopener noreferrer')
  assert.equal(link.props.referrerPolicy, 'no-referrer')
  assert.equal(link.props.download, undefined)
  assert.equal(elements(tree, el => el.type === 'input').length, 0)
  const source = readFileSync('components/portal-drive-photos.tsx', 'utf8')
  assert.doesNotMatch(source, /window\.open|localStorage|sessionStorage|\.zip|download=/)
  const page = readFileSync('app/portal/[id]/page.tsx', 'utf8')
  assert.match(page, /data\.selection\?\.status === 'SUBMITTED' && data\.deliverables\.length > 0 \? <PortalDrivePhotos/)
  assert.match(page, /key=\{publicId\}/)
  f.unmount()
})

test('returning clients verify PIN without resubmitting; failures clear PIN and success reveals View All Photos', async t => {
  const f = setup(); t.after(f.unmount)
  let tree = f.render(), attempts = 0, accepted = false
  const click = () => elements(tree, el => el.type === 'button' && content(el) === 'View All Photos')[0].props.onClick()
  t.mock.method(globalThis, 'fetch', async (url: string | URL | Request, init?: RequestInit) => {
    attempts++
    assert.equal(url, `/api/editor-workflow/portal/${id}/drive-photos`)
    assert.equal(init?.method, 'POST')
    assert.equal(init?.cache, 'no-store')
    assert.deepEqual(JSON.parse(String(init?.body)), { pin: accepted ? '0042' : '0000' })
    return accepted ? Response.json({ url: driveUrl }) : Response.json({ error: 'Incorrect PIN. Try: enter your booking PIN.' }, { status: 403 })
  })
  click(); tree = f.render()
  const enter = (pin: string) => { elements(tree, el => el.type === 'input')[0].props.onChange({ target: { value: pin } }); tree = f.render() }
  const verify = async () => { elements(tree, el => el.type === 'form')[0].props.onSubmit({ preventDefault() {} }); await new Promise(resolve => setImmediate(resolve)); tree = f.render() }
  enter('0000'); await verify()
  assert.equal(attempts, 1)
  assert.match(content(tree), /Incorrect PIN/)
  assert.equal(elements(tree, el => el.type === 'a').length, 0)
  assert.equal(elements(tree, el => el.type === 'input')[0].props.value, '')
  accepted = true; enter('0042'); await verify()
  assert.equal(attempts, 2)
  assert.equal(elements(tree, el => el.type === 'a')[0].props.href, driveUrl)
  assert.equal(elements(tree, el => el.type === 'input').length, 0)
})

test('untrusted URL results are never rendered as a link', async t => {
  for (const url of ['javascript:alert(1)', 'https://evil.invalid/', 'https://drive.google.com/drive/folders/a?redirect=evil']) {
    const f = setup(url)
    assert.equal(elements(f.render(), el => el.type === 'a').length, 0)
    f.unmount()
  }
  const f = setup(); t.after(f.unmount)
  let tree = f.render()
  t.mock.method(globalThis, 'fetch', async () => Response.json({ url: 'https://evil.invalid/' }))
  elements(tree, el => el.type === 'button')[0].props.onClick(); tree = f.render()
  elements(tree, el => el.type === 'input')[0].props.onChange({ target: { value: '0042' } }); tree = f.render()
  elements(tree, el => el.type === 'form')[0].props.onSubmit({ preventDefault() {} })
  await new Promise(resolve => setImmediate(resolve)); tree = f.render()
  assert.equal(elements(tree, el => el.type === 'a').length, 0)
  assert.match(content(tree), /Try:/)
})

test('Drive access accepts only a PIN, not client-supplied folder IDs, phones or URLs', () => {
  assert.equal(schemas.portalDrivePhotosSchema.safeParse({ pin: '0042' }).success, true)
  for (const input of [{}, { pin: 42 }, { pin: '42' }, { pin: '0042', folderId: 'other' }, { pin: '0042', phone: '09000000042' }, { pin: '0042', url: driveUrl }]) {
    assert.equal(schemas.portalDrivePhotosSchema.safeParse(input).success, false)
  }
})

test('Drive access route shares the exact IP-only PIN policy, blocks origins/limits, and preserves saved selection on link failure', async () => {
  const policy = { name: 'portal-submission-pin' }
  const calls: Array<{ policy: unknown; dimensions: unknown }> = []
  let blocked = false, trusted = true, reads = 0, driveFails = false
  class PortalSelectionError extends Error {}
  const route = loadTs<typeof import('../app/api/editor-workflow/[...path]/route.ts')>('app/api/editor-workflow/[...path]/route.ts', {
    '@/lib/onsite-photo-reset': {},
    '@/lib/selection-review': { SelectionReviewError: class SelectionReviewError extends Error {}, reviewSelection: async () => ({ success: true }) },
    "@/lib/portal-download-stream": {},
    'next/server': { NextResponse: { json: Response.json } }, archiver: {},
    '@/lib/editor-workflow': { PortalSelectionError, submitPhotoSelection: async () => ({ selection: { status: 'SUBMITTED' } }), getPortalDrivePhotos: async () => { reads++; if (driveFails) throw new Error('Private provider failure'); return { url: driveUrl } } },
    '@/lib/package-workflow': {}, '@/lib/auth-api': {}, '@/lib/auth/workflow': {}, '@/lib/google-drive': {},
    '@/lib/security/api-rate-limit': { API_RATE_LIMITS: { portalSubmissionPin: policy }, enforceApiRateLimit: async (_r: Request, p: unknown, dimensions: unknown) => { calls.push({ policy: p, dimensions }); return blocked && p === policy ? Response.json({ code: 'RATE_LIMITED' }, { status: 429 }) : null } },
    '@/lib/security/file-validation': {}, '@/lib/security/schemas': { ...schemas, portalSelectionSchema: { safeParse: () => ({ success: true, data: { pin: '0042' } }) } },
    '@/lib/security/security-audit': { recordSecurityAuditEvent: async () => {} }, '@/lib/security/upload-scanner': {},
    '@/lib/security/request-security': { rejectUntrustedMutation: () => trusted ? null : Response.json({}, { status: 403 }) },
    '@/lib/raw-upload-server': {}, '@/lib/raw-upload-contract': { RawUploadError: class extends Error {} },
  })
  const request = (endpoint = 'drive-photos', body: unknown = { pin: '0042' }) => {
    const req = new Request(`https://www.ficomana.com/api/editor-workflow/portal/${id}/${endpoint}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    return route.POST(req as never, { params: Promise.resolve({ path: ['portal', id, endpoint] }) })
  }
  const response = await request()
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer')
  assert.deepEqual(await response.json(), { url: driveUrl })
  assert.equal((await request('drive-photos', { pin: '0042', folderId: 'other' })).status, 400)
  assert.equal(reads, 1)
  blocked = true; assert.equal((await request()).status, 429); assert.equal(reads, 1)
  blocked = false; trusted = false; assert.equal((await request()).status, 403); assert.equal(reads, 1)
  trusted = true
  const submitted = await request('selection')
  assert.equal((await submitted.json()).allPhotosUrl, driveUrl)
  driveFails = true
  const saved = await request('selection')
  assert.equal(saved.status, 200)
  const body = await saved.json()
  assert.equal(body.selection.status, 'SUBMITTED')
  assert.match(body.allPhotosWarning, /Your selection was saved.*Try:/)
  assert.ok(!JSON.stringify(body).includes('Private provider'))
  assert.ok(calls.filter(call => call.policy === policy).length >= 4)
  assert.ok(calls.filter(call => call.policy === policy).every(call => call.dimensions === undefined))
})
