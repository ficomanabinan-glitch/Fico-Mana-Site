import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { loadTs } from './helpers/load-ts.ts'
import * as manifestTools from '../lib/print-manifest.ts'
import { validateEditedPhotoMetadata } from '../lib/security/file-validation.ts'

const categories = ['TOGA_PICTURE_4R', 'ALAMPAY_BARONG_4R', 'FRAME_8R', 'WALLET_SIZE']
const gallery = categories.map((_, index) => ({ id: `g${index}`, file_name: `092${index}.CR3` }))
const allocations = categories.map((category, index) => ({ category, gallery_file_id: `g${index}`, quantity: index === 3 ? 4 : 1 }))
const input = { bookingId: 'SYNTHETIC', selectionId: 'selection', allocations, gallery }
const checksums = categories.map((_, index) => String(index + 1).repeat(64))

test('manifest creates seven pending print slots, with four individually named wallet copies', () => {
  const manifest = manifestTools.buildPrintManifest(input)
  assert.equal(manifest.outputs.length, 7)
  assert.equal(manifest.source_stage, 'verified_enhanced_uploads_only')
  assert.equal(manifest.prints_folder, 'PRINTS')
  assert.deepEqual(manifest.outputs.map(output => output.name_prefix), [
    'TOGA PICTURE', 'ALAMBAY BARONG', 'FRAME', 'WALLET SIZE 1', 'WALLET SIZE 2', 'WALLET SIZE 3', 'WALLET SIZE 4',
  ])
  assert.ok(manifest.outputs.every(row => row.status === 'awaiting_enhanced_upload' && row.print_file_id === null && row.enhanced_file_id === null))
  assert.equal(manifestTools.printOutputName(manifest.outputs[0], '0920.JPG'), 'TOGA PICTURE - 0920.JPG')
  assert.equal(manifestTools.printOutputName(manifest.outputs[6], '0923.png'), 'WALLET SIZE 4 - 0923.png')
  assert.deepEqual(manifest, manifestTools.buildPrintManifest(input), 'Repeated builds are deterministic')
})

test('wallet prints can use one to four different included photos with stable names', () => {
  const walletGallery = [
    ...gallery,
    { id: 'g4', file_name: '0924.CR3' },
  ]
  const splitWallet = [
    ...allocations.slice(0, 3),
    { category: 'WALLET_SIZE', gallery_file_id: 'g3', quantity: 1 },
    { category: 'WALLET_SIZE', gallery_file_id: 'g4', quantity: 1 },
  ]
  const manifest = manifestTools.buildPrintManifest({ ...input, gallery: walletGallery, allocations: splitWallet })
  const wallet = manifest.outputs.filter(output => output.category === 'WALLET_SIZE')
  assert.deepEqual(wallet.map(output => [output.name_prefix, output.source_gallery_file_id]), [
    ['WALLET SIZE 1', 'g3'],
    ['WALLET SIZE 2', 'g4'],
  ])
  assert.equal(new Set(wallet.map(output => output.key)).size, 2)
})

test('print instructions reject foreign gallery IDs, duplicate categories, and broken quantities', () => {
  assert.throws(() => manifestTools.buildPrintManifest({ ...input, gallery: [] }), /incomplete/)
  assert.throws(() => manifestTools.buildPrintManifest({ ...input, allocations: [allocations[0], allocations[0]] }), /invalid/)
  assert.throws(() => manifestTools.buildPrintManifest({ ...input, allocations: [{ ...allocations[3], quantity: 3 }] }), /incomplete/)
  assert.throws(() => manifestTools.buildPrintManifest({ ...input, allocations: allocations.slice(1) }), /missing/)
  assert.throws(() => manifestTools.buildPrintManifest({ ...input, allocations: [{ ...allocations[0], category: '__proto__' }] }), /invalid/)
  assert.equal(manifestTools.buildPrintManifest({ ...input, allocations: [] }).outputs.length, 0, 'Older selections without print allocations remain valid')
})

test('enhanced matching allows RAW-to-JPEG export but rejects missing, ambiguous, and unverified files', () => {
  const output = manifestTools.buildPrintManifest(input).outputs[0]
  const file = { drive_file_id: 'enhanced', file_name: '0920.JPG', checksum: checksums[0] }
  assert.equal(manifestTools.matchEnhancedPrintSource(output, [file]), file)
  const prefixed = { ...file, file_name: 'ENHANCED - 0920.JPG' }
  assert.equal(manifestTools.matchEnhancedPrintSource(output, [prefixed]), prefixed)
  assert.equal(manifestTools.printOutputName(output, prefixed.file_name), 'TOGA PICTURE - 0920.JPG')
  assert.throws(() => manifestTools.matchEnhancedPrintSource(output, [{ ...file, file_name: 'DSC_0920.JPG' }]), /missing.*Try:/)
  assert.throws(() => manifestTools.matchEnhancedPrintSource(output, [{ ...file, checksum: '' }]), /missing/)
  assert.throws(() => manifestTools.matchEnhancedPrintSource(output, [file, { ...file, drive_file_id: 'second', file_name: '0920.PNG' }]), /More than one.*Try:/)
  const jpegOutput = { ...output, source_file_name: '0920.jpg' }
  assert.equal(manifestTools.matchEnhancedPrintSource(jpegOutput, [file, { ...file, drive_file_id: 'second', file_name: '0920.png' }]), file)
})

function fixture(options: { renamed?: boolean; missing?: boolean; foreign?: boolean; hashMismatch?: boolean; copyFailAt?: number; dbError?: boolean; status?: string; mimeType?: string } = {}) {
  const deliveries = categories.map((_, index) => ({
    drive_file_id: `edited${index}`, file_name: options.renamed ? `ENHANCED ${index + 1} - ELRISH JOHN RULL.JPG` : `ENHANCED - 092${index}.JPG`, checksum: checksums[index], relative_path: `EDITED/ENHANCED - 092${index}.JPG`,
    workspace_id: 'workspace', booking_id: 'SYNTHETIC', editing_job_id: 'job',
  }))
  const tables: Record<string, Array<Record<string, unknown>>> = {
    photo_selections: [{ id: 'selection', status: options.status || 'SUBMITTED', workspace_id: 'workspace', booking_id: 'SYNTHETIC' }],
    print_allocations: allocations.map(row => ({ ...row, selection_id: 'selection', workspace_id: 'workspace', booking_id: 'SYNTHETIC' })),
    gallery_files: gallery.map(row => ({ ...row, workspace_id: 'workspace', booking_id: 'SYNTHETIC' })),
    deliverable_files: deliveries,
    batch_upload_files: deliveries.slice(options.missing ? 1 : 0).map(row => ({ ...row, upload_item_id: 'item', status: 'UPLOADED' })),
  }
  const admin = { from(table: string) {
    const filters: Array<(row: Record<string, unknown>) => boolean> = []
    let patch: Record<string, unknown> | null = null
    const query = {
      select() { return query }, order() { return query },
      eq(key: string, value: unknown) { filters.push(row => row[key] === value); return query },
      in(key: string, values: unknown[]) { filters.push(row => values.includes(row[key])); return query },
      update(value: Record<string, unknown>) { patch = value; return query },
      async maybeSingle() { const result = await query; return { ...result, data: result.data[0] || null } },
      then(resolve: (value: { data: Array<Record<string, unknown>>; error: { message: string } | null }) => unknown) {
        const rows = (tables[table] || []).filter(row => filters.every(filter => filter(row)))
        if (patch) for (const row of rows) Object.assign(row, patch)
        return Promise.resolve(resolve({ data: rows, error: options.dbError ? { message: 'synthetic outage' } : null }))
      },
    }
    return query
  } }
  const copies: Array<Record<string, unknown>> = []
  const documents: manifestTools.PrintManifest[] = []
  const folders: string[] = []
  const hashes: string[] = []
  const workflow = loadTs<typeof import('../lib/print-workflow.ts')>('lib/print-workflow.ts', {
    '@/lib/print-manifest': manifestTools,
    '@/lib/security/file-validation': { validateEditedPhotoMetadata },
    '@/lib/google-drive': {
      findOrCreateFolder: async (parent: string, name: string) => { assert.equal(parent, 'selected'); folders.push(name); return { id: 'prints' } },
      getDriveFile: async (id: string) => {
        const file = deliveries.find(row => row.drive_file_id === id)!
        return { id, name: file.file_name, size: '8', mimeType: options.mimeType || 'image/jpeg', md5Checksum: 'synthetic', parents: [options.foreign ? 'other-client' : 'edited'],
          appProperties: { bookingId: 'SYNTHETIC', checksum: file.checksum } }
      },
      hashDriveFileSha256: async (id: string) => {
        hashes.push(id)
        return { bytes: 8, checksum: options.hashMismatch ? 'wrong' : deliveries.find(row => row.drive_file_id === id)!.checksum }
      },
      copyEnhancedPrint: async (copy: Record<string, unknown>) => {
        if (options.copyFailAt === copies.length) throw new Error('Synthetic Drive outage')
        copies.push(copy); return { id: `print${copies.length}`, name: copy.fileName }
      },
      upsertDriveFile: async (file: { destinationFolderId: string; purpose: string; data: Buffer }) => {
        assert.equal(file.destinationFolderId, 'selected', 'JSON is outside the PRINTS folder')
        assert.equal(file.purpose, 'print-manifest')
        documents.push(JSON.parse(file.data.toString())); return { file: { id: 'json' } }
      },
    },
  })
  const run = () => workflow.fulfillBookingPrints({ admin: admin as never, workspaceId: 'workspace', bookingId: 'SYNTHETIC',
    editingJobId: 'job', uploadItemId: 'item', selectedFolderId: 'selected', editedFolderId: 'edited' })
  return { run, copies, documents, folders, hashes, tables }
}

test('successful print preparation uses only enhanced sources and writes pending then complete reports', async () => {
  const f = fixture()
  const manifest = await f.run()
  assert.equal(f.copies.length, 7)
  assert.deepEqual(f.folders, ['PRINTS'], 'No per-category folders are created')
  assert.equal(f.hashes.length, 4, 'Each unique source is checked once, including a shared wallet image')
  assert.ok(f.copies.every(copy => (copy.source as { id: string }).id.startsWith('edited') && copy.destinationFolderId === 'prints'))
  assert.ok(f.documents[0].outputs.every(row => row.status === 'awaiting_enhanced_upload'))
  assert.ok(f.documents[1].outputs.every(row => row.status === 'ready' && row.print_file_id))
  assert.deepEqual(manifest, f.documents[1])
  assert.equal(f.tables.print_allocations[3].drive_file_id, 'print4')
})

test('numbered enhanced uploads still match the right original and preserve every print filename', async () => {
  const previous = fixture(), renamed = fixture({ renamed: true })
  await previous.run(); await renamed.run()
  assert.deepEqual(renamed.copies.map(copy => copy.fileName), previous.copies.map(copy => copy.fileName))
  assert.deepEqual(renamed.copies.map(copy => copy.fileName), [
    'TOGA PICTURE - 0920.JPG', 'ALAMBAY BARONG - 0921.JPG', 'FRAME - 0922.JPG',
    'WALLET SIZE 1 - 0923.JPG', 'WALLET SIZE 2 - 0923.JPG', 'WALLET SIZE 3 - 0923.JPG', 'WALLET SIZE 4 - 0923.JPG',
  ])
  assert.ok(renamed.copies.every(copy => (copy.source as { name: string }).name.startsWith('ENHANCED ')))
})

test('missing, foreign, changed, unsubmitted, or unreadable sources cannot create a print copy', async () => {
  for (const options of [{ missing: true }, { foreign: true }, { hashMismatch: true }, { status: 'OPEN' }, { dbError: true }]) {
    const f = fixture(options)
    await assert.rejects(f.run(), /Try:/)
    assert.equal(f.copies.length, 0)
  }
})

test('print preparation preserves the uploader contract for valid images without a browser MIME type', async () => {
  const f = fixture({ mimeType: 'application/octet-stream' })
  assert.equal((await f.run()).outputs.filter(row => row.status === 'ready').length, 7)
  const invalid = fixture({ mimeType: 'text/html' })
  await assert.rejects(invalid.run(), /allowed format/)
  assert.equal(invalid.copies.length, 0)
})

test('interrupted print copies never publish a ready manifest or ready database links', async () => {
  const f = fixture({ copyFailAt: 2 })
  await assert.rejects(f.run(), /Synthetic Drive outage/)
  assert.equal(f.copies.length, 2)
  assert.equal(f.documents.length, 1)
  assert.ok(f.documents[0].outputs.every(row => row.status === 'awaiting_enhanced_upload'))
  assert.ok(f.tables.print_allocations.every(row => !row.drive_file_id))
})

test('workflow integrates print instructions at selection/download and fulfills before delivery with a shared lock', () => {
  const source = readFileSync('lib/editor-workflow.ts', 'utf8')
  const allocationStart = source.indexOf('const allocationRows:')
  const allocationEnd = source.indexOf("for (const table of ['photo_selection_items'", allocationStart)
  assert.ok(allocationStart >= 0 && allocationEnd > allocationStart)
  const allocationCode = source.slice(allocationStart, allocationEnd)
  assert.doesNotMatch(allocationCode, /copyDriveFile|findOrCreateFolder/)
  assert.match(allocationCode, /drive_file_id: null/)
  assert.match(source, /SELECTED\/manifest.json/)
  assert.match(source, /print_manifest: printManifests/)
  const finalizer = source.slice(source.indexOf('export async function finalizeClientUpload('))
  assert.ok(finalizer.indexOf('fulfillBookingPrints') < finalizer.indexOf("status: 'DELIVERED'"))
  assert.match(finalizer, /download_lock_expires_at.is.null,download_lock_expires_at.lte/)
  assert.match(finalizer, /finally[\s\S]*eq\('download_lock_expires_at', printLockUntil\)/)
  assert.match(finalizer, /PRINT_PREPARATION_FAILED/)
})
