import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './helpers/load-ts.ts'

test('authenticated day batch prepares a folder with client roots ready for edited upload', async () => {
  const date = '2026-09-29'
  const batchId = `${date}-studio`
  let prepared = 0
  const route = loadTs<typeof import('../app/api/editor-workflow/[...path]/route.ts')>('app/api/editor-workflow/[...path]/route.ts', {
    'next/server': { NextResponse: { json: Response.json } },
    '@/lib/package-workflow': {},
    '@/lib/auth-api': { requireWorkflowAuth: async () => ({ user: { id: 'staff-1' }, access: { workspaceId: 'workspace-1' }, error: null }) },
    '@/lib/auth/workflow': { canUseWorkflow: () => true },
    '@/lib/editor-workflow': { prepareBatchDownload: async () => ({
      batch: { id: batchId }, jobs: [], manifest: { shoot_date: date }, fileName: batchId,
      entries: [
        { name: `${date}/manifest.json`, data: Buffer.from('{}') },
        { name: `${date}/Client A/SELECTED/EDITED/`, data: Buffer.alloc(0) },
        { name: `${date}/Client A/SELECTED/PHOTO.JPG`, storageKey: 'private/photo' },
      ],
    }) },
    '@/lib/portal-raw-downloads': {}, '@/lib/storage/storage-service': {},
    '@/lib/security/api-rate-limit': { API_RATE_LIMITS: { storageOperation: {} }, enforceApiRateLimit: async () => null },
    '@/lib/security/file-validation': {}, '@/lib/security/schemas': {}, '@/lib/security/security-audit': {},
    '@/lib/security/upload-scanner': {}, '@/lib/security/request-security': { rejectUntrustedMutation: () => null },
    '@/lib/raw-upload-server': {}, '@/lib/raw-upload-contract': {}, '@/lib/onsite-photo-reset': {},
    '@/lib/selection-review': {}, '@/lib/portal-page-payload': {},
    '@/lib/private-download-manifest': { createEditorBatchDownloadRedirect: async (input: { entries: Array<{ name: string }> }) => {
      prepared++
      assert.deepEqual(input.entries.map(entry => entry.name), [
        'manifest.json', 'Client A/SELECTED/EDITED/', 'Client A/SELECTED/PHOTO.JPG',
      ])
      return 'https://downloads.example/folder/manifest?token=private'
    } },
  })
  const url = new URL(`https://editor.ficomana.com/api/editor-workflow/batches/${batchId}/download`)
  const response = await route.POST(Object.assign(new Request(url, { method: 'POST' }), { nextUrl: url }) as never, {
    params: Promise.resolve({ path: ['batches', batchId, 'download'] }),
  })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { url: 'https://downloads.example/folder/manifest?token=private' })
  assert.equal(prepared, 1)
})
