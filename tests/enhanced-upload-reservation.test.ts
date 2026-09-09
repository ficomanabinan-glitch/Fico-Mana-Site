import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { loadTs } from './helpers/load-ts.ts'

function fixture() {
  const job = { id: 'job', workspace_id: 'studio', booking_id: 'booking', download_lock_expires_at: null as string | null }
  const files: Record<string, any>[] = [], deliveries: Record<string, any>[] = []
  const tables: Record<string, Record<string, any>[]> = {
    editing_jobs: [job], bookings: [{ id: 'booking', workspace_id: 'studio', customer_name: 'Elrish John Rull' }],
    batch_upload_files: files, deliverable_files: deliveries,
  }
  let dbError = false
  const admin = { from(table: string) {
    const filters: Array<(row: Record<string, any>) => boolean> = []
    let update: Record<string, any> | null = null, upsert: Record<string, any> | null = null
    let rangeStart = 0, rangeEnd = 999
    const execute = () => {
      if (dbError && table === 'bookings') return { data: null, error: { message: 'synthetic read failure' } }
      if (upsert) {
        let row = files.find(file => file.upload_item_id === upsert!.upload_item_id && file.relative_path === upsert!.relative_path)
        if (!row) { row = { id: `file-${files.length}`, batch_upload_items: { booking_id: 'booking', editing_job_id: 'job' } }; files.push(row) }
        Object.assign(row, upsert)
        return { data: [row], error: null }
      }
      const rows = (tables[table] || []).filter(row => filters.every(filter => filter(row)))
      if (update) rows.forEach(row => Object.assign(row, update))
      return { data: rows.slice(rangeStart, rangeEnd + 1), error: null }
    }
    const query = {
      select() { return query },
      order() { return query },
      range(from: number, to: number) { rangeStart = from; rangeEnd = to; return query },
      eq(key: string, value: unknown) { filters.push(row => key.split('.').reduce((next, part) => next?.[part], row) === value); return query },
      or() { filters.push(row => !row.download_lock_expires_at || Date.parse(row.download_lock_expires_at) <= Date.now()); return query },
      update(value: Record<string, any>) { update = value; return query },
      upsert(value: Record<string, any>) { upsert = value; return query },
      single() { const result = execute(); return Promise.resolve({ ...result, data: result.data?.[0] || null }) },
      maybeSingle() { return query.single() },
      then(resolve: (value: unknown) => unknown) { return Promise.resolve(execute()).then(resolve) },
    }
    return query
  } }
  const code = readFileSync('lib/editor-workflow.ts', 'utf8')
  const reservation = code.slice(code.indexOf('async function reserveEnhancedUpload'), code.indexOf('export async function createDeliverableUploadSession'))
  const { reserveEnhancedUpload } = loadTs<any>('lib/editor-workflow.ts', {}, `import { enhancedUploadName } from '@/lib/enhanced-upload-naming';
    const nowIso = () => new Date().toISOString(); export ${reservation}`)
  const reserve = (source = 'one.JPG', checksum = 'a'.repeat(64), item = 'item') => reserveEnhancedUpload(admin, 'studio', { id: item, editing_job_id: 'job' }, {
    bookingId: 'booking', relativePath: `EDITED/ENHANCED - ${source}`, fileName: `ENHANCED - ${source}`, mimeType: 'image/jpeg', fileSize: 12, checksum,
  })
  return { reserve, files, deliveries, job, failReads: () => { dbError = true } }
}

test('actual server reservation saves the new name before upload, reuses it across runs and releases the booking lock', async () => {
  const f = fixture()
  assert.equal((await f.reserve()).fileName, 'ENHANCED 1 - ELRISH JOHN RULL.JPG')
  assert.equal(f.files[0].relative_path, 'EDITED/ENHANCED - one.JPG', 'Print matching retains the source name')
  assert.equal((await f.reserve('two.png')).fileName, 'ENHANCED 2 - ELRISH JOHN RULL.png')
  assert.equal((await f.reserve('one.JPG', 'b'.repeat(64), 'retry-run')).fileName, 'ENHANCED 1 - ELRISH JOHN RULL.JPG')
  assert.equal(f.job.download_lock_expires_at, null)
})

test('existing verified duplicates keep their filename and Drive ID; failed reads never reserve a name', async () => {
  const f = fixture()
  f.deliveries.push({ workspace_id: 'studio', booking_id: 'booking', relative_path: 'EDITED/ENHANCED - one.JPG',
    file_name: 'ENHANCED - one.JPG', drive_file_id: 'existing-drive-file', checksum: 'a'.repeat(64) })
  const result = await f.reserve()
  assert.equal(result.duplicate, true); assert.equal(result.fileName, 'ENHANCED - one.JPG')
  assert.equal(result.uploadFile.drive_file_id, 'existing-drive-file')
  const broken = fixture(); broken.failReads()
  await assert.rejects(broken.reserve(), /Could not verify/)
  assert.equal(broken.files.length, 0); assert.equal(broken.job.download_lock_expires_at, null)
})

test('competing reservations cannot allocate the same number', async () => {
  const f = fixture()
  const results = await Promise.allSettled([f.reserve('one.JPG'), f.reserve('two.JPG', 'b'.repeat(64), 'second-run')])
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal(results.filter(result => result.status === 'rejected').length, 1)
  assert.equal((await f.reserve('two.JPG', 'b'.repeat(64), 'second-run')).fileName, 'ENHANCED 2 - ELRISH JOHN RULL.JPG')
})

test('number allocation includes reservations beyond the database default result limit', async () => {
  const f = fixture()
  for (let index = 1; index <= 1_050; index++) f.files.push({
    id: `old-${index}`, relative_path: `EDITED/ENHANCED - old-${index}.JPG`, file_name: `ENHANCED ${index} - ELRISH JOHN RULL.JPG`,
    batch_upload_items: { booking_id: 'booking', editing_job_id: 'job' },
  })
  assert.equal((await f.reserve()).fileName, 'ENHANCED 1051 - ELRISH JOHN RULL.JPG')
})
