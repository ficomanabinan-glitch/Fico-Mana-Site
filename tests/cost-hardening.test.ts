import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migrationPath = 'supabase/migrations/20260921045312_storage_retention_and_batch_downloads.sql'

test('editor batch archives are handed to the private R2 worker', async () => {
  const [route, manifest, worker] = await Promise.all([
    readFile('app/api/editor-workflow/[...path]/route.ts', 'utf8'),
    readFile('lib/private-download-manifest.ts', 'utf8'),
    readFile('workers/private-downloads/src/index.js', 'utf8'),
  ])
  assert.match(route, /createEditorBatchDownloadRedirect/)
  assert.doesNotMatch(route, /archiver\('zip'/)
  assert.match(manifest, /kind: 'EDITOR_BATCH'/)
  assert.match(manifest, /inlineBase64/)
  assert.match(worker, /Uint8ArrayReader/)
  assert.match(worker, /entry\.inlineBase64/)
})

test('automatic retention is restricted to delivered originals with no active portal', async () => {
  const migration = await readFile('supabase/migrations/20260921052025_manual_expired_raw_cleanup.sql', 'utf8')
  assert.match(migration, /split_part\(g\.storage_key, '\/', 8\) in \('raw', 'original'\)/i)
  assert.match(migration, /j\.status = 'DELIVERED'/i)
  assert.match(migration, /p\.status = 'active'/i)
  assert.match(migration, /p\.expires_at is not null/i)
  assert.match(migration, /p\.expires_at <= clock_timestamp\(\)/i)
  assert.match(migration, /p\.expires_at is null or p\.expires_at > clock_timestamp\(\)/i)
  assert.match(migration, /from public\.private_expired_raw_cleanup_candidates\(settings\.workspace_id\)/i)
  assert.doesNotMatch(migration, /split_part\(g\.storage_key,'\/',8\) in \([^)]*'enhanced'/i)
  assert.match(await readFile(migrationPath, 'utf8'), /enabled boolean not null default false/i)
})

test('retention worker is scheduled but exits while policy is disabled', async () => {
  const [worker, config] = await Promise.all([
    readFile('workers/private-downloads/src/index.js', 'utf8'),
    readFile('workers/private-downloads/wrangler.jsonc', 'utf8'),
  ])
  assert.match(worker, /claim_storage_retention_batch/)
  assert.match(worker, /if \(!claim\?\.enabled/)
  assert.match(worker, /PRIVATE_PHOTOS\.delete/)
  assert.match(config, /"crons": \["17 18 \* \* \*"\]/)
})

test('file management exposes indexed storage cost and retention readiness', async () => {
  const [page, route] = await Promise.all([
    readFile('app/editor/files/page.tsx', 'utf8'),
    readFile('app/api/editor-files/route.ts', 'utf8'),
  ])
  assert.match(page, /Private storage overview/)
  assert.match(page, /Dry-run only/)
  assert.match(page, /Enhanced, final, and print files stay untouched/)
  assert.match(page, /DELETE ALL RAW PHOTOS/)
  assert.match(page, /confirmationToken: rawCleanupPreview\.confirmationToken/)
  assert.match(route, /private_storage_summary/)
  assert.match(route, /private_expired_raw_cleanup_candidates/)
  assert.match(route, /body\.confirmationToken !== preview\.confirmationToken/)
  assert.match(route, /storagePerGbMonth: 0\.015/)
  assert.match(route, /egressPerGb: 0/)
})

test('manual RAW cleanup presents every eligible folder and requires the exact phrase', async () => {
  const dialog = await readFile('components/expired-raw-cleanup-dialog.tsx', 'utf8')
  assert.match(dialog, /preview\.folders\.map/)
  assert.match(dialog, /folder\.portalExpiredAt/)
  assert.match(dialog, /confirmation === FOLDER_DELETE_CONFIRMATION/)
  assert.match(dialog, /disabled=\{busy \|\| loading \|\| !matches\}/)
})
