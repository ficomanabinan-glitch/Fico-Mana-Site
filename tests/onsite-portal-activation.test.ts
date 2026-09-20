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
  const dialog = await readFile('components/file-delete-dialog.tsx', 'utf8')
  const folderDialog = await readFile('components/folder-delete-dialog.tsx', 'utf8')
  const folderDeletePolicy = await readFile('lib/file-management-delete.ts', 'utf8')
  const middleware = await readFile('lib/supabase/middleware.ts', 'utf8')

  assert.match(route, /if \(openId && \(openSource === 'gallery' \|\| openSource === 'deliverable'\)\)/)
  assert.match(route, /await getObject\(previewKey\)/)
  assert.doesNotMatch(route, /createDownloadUrl|NextResponse\.redirect|listObjects|listAllObjectKeys|readObject/)
  assert.match(page, /Open a folder to load its contents\. Photos stay private until you open one\./)
  assert.match(page, /useEffect\(\(\) =>/)
  assert.match(page, /Add photos/)
  assert.match(page, /<FileDeleteDialog/)
  assert.match(page, /<FolderDeleteDialog/)
  assert.match(dialog, /Delete this file\?/)
  assert.match(folderDialog, /FOLDER_DELETE_CONFIRMATION/)
  assert.match(folderDeletePolicy, /'CONFIRM DELETE'/)
  assert.match(folderDialog, /case-sensitive/)
  assert.match(route, /const details = Boolean\(bookingId && category\)/)
  assert.match(page, /generation !== staffPageCacheGeneration\(\)/)
  assert.match(route, /export async function DELETE/)
  assert.match(route, /photo_selection_items/)
  assert.match(route, /print_allocations/)
  assert.match(route, /isFolderDeleteConfirmation/)
  assert.match(route, /EDITOR_FOLDER_DELETE_COMPLETED/)
  assert.match(middleware, /pathname\.startsWith\('\/api\/editor-files'\)/)
})
