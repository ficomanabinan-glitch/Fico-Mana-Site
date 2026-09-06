import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('downloaded batches remain eligible for repeat download', async () => {
  const workflow = await readFile('lib/editor-workflow.ts', 'utf8')
  assert.match(
    workflow,
    /\.in\('status', \['READY_FOR_EDITING', 'DOWNLOADED', 'EDITING', 'READY_TO_UPLOAD', 'UPLOAD_FAILED'\]\)/,
  )
  assert.match(workflow, /No downloadable selected clients are available in this batch/)
  assert.match(workflow, /status: 'DOWNLOADED'/)
})

test('week and month grouping use one collection download instead of per-day buttons', async () => {
  const queue = await readFile('components/editor-queue.tsx', 'utf8')
  assert.match(queue, /collections\/download\?scope=/)
  assert.match(queue, /Download Whole \$\{groupMode==='week'\?'Week':'Month'\}/)
  assert.match(queue, /canDownload&&groupMode!=='day'/)
  assert.match(queue, /canDownload=\{canDownload&&groupMode==='day'\}/)
})

test('editor-visible queue statuses are simplified after download', async () => {
  const queue = await readFile('components/editor-queue.tsx', 'utf8')
  const batchDetail = await readFile('app/admin/filtering/batch/[batchId]/page.tsx', 'utf8')
  assert.match(queue, /\['DOWNLOADED','Downloaded'\]/)
  assert.doesNotMatch(queue, /\['EDITING','Downloaded \/ Editing'\]/)
  assert.doesNotMatch(queue, /\['READY_TO_UPLOAD','Ready for Upload'\]/)
  assert.match(queue, /\['Pending Download',batch\.counts\.readyForEditing\]/)
  assert.match(queue, /\['Downloaded',downloadedCount\(batch\)\]/)
  assert.match(batchDetail, /'Download Day Batch Again':'Download Day Batch'/)
  assert.doesNotMatch(batchDetail, />Start Editing</)
  assert.doesNotMatch(batchDetail, />Ready to Upload</)
})
