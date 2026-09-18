import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('file management and client previews stream through authorized application routes', async () => {
  const [filesRoute, portalRoute, workflow] = await Promise.all([
    readFile('app/api/editor-files/route.ts', 'utf8'),
    readFile('app/api/editor-workflow/[...path]/route.ts', 'utf8'),
    readFile('lib/editor-workflow.ts', 'utf8'),
  ])

  assert.match(filesRoute, /requireWorkflowAuth\('view'/)
  assert.match(filesRoute, /canUseWorkflow\(access, 'edit'\)/)
  assert.match(filesRoute, /await getObject\(previewKey\)/)
  assert.doesNotMatch(filesRoute, /createDownloadUrl|NextResponse\.redirect/)
  assert.match(portalRoute, /await getObject\(file\.storageKey\)/)
  assert.match(portalRoute, /cdn-cache-control': 'no-store'/)
  assert.doesNotMatch(workflow, /redirectUrl:\s*await createDownloadUrl\(\{ key: storageKey/)
})

test('all original photos unlock only after a submitted selection and remain rate limited', async () => {
  const [workflow, route, payload, portal] = await Promise.all([
    readFile('lib/editor-workflow.ts', 'utf8'),
    readFile('app/api/editor-workflow/[...path]/route.ts', 'utf8'),
    readFile('lib/portal-page-payload.ts', 'utf8'),
    readFile('components/client-portal-page.tsx', 'utf8'),
  ])

  assert.match(workflow, /export async function preparePortalRawPhotos/)
  assert.match(workflow, /selection\.data\.status !== 'SUBMITTED'/)
  assert.match(workflow, /storage_provider', 'r2'\)\.eq\('storage_status', 'available'/)
  assert.match(route, /API_RATE_LIMITS\.portalRawDownload/)
  assert.match(route, /raw-photos\.zip/)
  assert.match(payload, /rawDownloadAllUrl: data\.selection\?\.status === 'SUBMITTED'/)
  assert.match(portal, /Download all originals/)
})
