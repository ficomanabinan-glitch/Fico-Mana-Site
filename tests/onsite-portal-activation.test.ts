import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('booking and storage setup do not create the client portal before an onsite photo is indexed', async () => {
  const provisioning = await readFile('lib/booking-provisioning.ts', 'utf8')
  const storage = await readFile('lib/storage/booking-storage.ts', 'utf8')
  const workflow = await readFile('lib/editor-workflow.ts', 'utf8')
  const upload = await readFile('lib/raw-upload-server.ts', 'utf8')

  assert.equal(provisioning.includes(".from('client_portals')\n    .insert"), false)
  assert.equal(storage.includes(".from('client_portals')\n      .insert"), false)
  assert.match(workflow, /uploadedBookingIds\.has\(String\(booking\.id\)\)[\s\S]*selectionBookings/)
  assert.match(upload, /galleryResult\.data[\s\S]+activateClientPortalAfterOnsiteUpload/)
})

test('editor file management is lazy, previews opened files, and protects mutations', async () => {
  const route = await readFile('app/api/editor-files/route.ts', 'utf8')
  const page = await readFile('app/editor/files/page.tsx', 'utf8')
  const middleware = await readFile('lib/supabase/middleware.ts', 'utf8')

  assert.match(route, /if \(openId && \(openSource === 'gallery' \|\| openSource === 'deliverable'\)\)/)
  assert.match(route, /createDownloadUrl/)
  assert.doesNotMatch(route, /listObjects|listAllObjectKeys|readObject|getObject\(/)
  assert.match(page, /Open a folder to load its contents\. Photos stay private until you open one\./)
  assert.match(page, /useEffect\(\(\) =>/)
  assert.match(page, /Add photos/)
  assert.match(page, /Delete this file\?/)
  assert.match(route, /export async function DELETE/)
  assert.match(route, /photo_selection_items/)
  assert.match(route, /print_allocations/)
  assert.match(middleware, /pathname\.startsWith\('\/api\/editor-files'\)/)
})
