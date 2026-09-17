import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import test from 'node:test'

const root = process.cwd()
const activeRoots = ['app', 'components', 'lib', 'scripts']
const activeFiles = ['.env.example', 'next.config.mjs', 'package.json', 'pnpm-lock.yaml']
const allowedFiles = new Set([
  'lib/migrations',
  'scripts/import-bookings.mjs',
  'scripts/secret-scan.mjs',
])
const retiredPattern = /google[-_]?drive|drive\.google|googleapis\.com\/upload\/drive|gdrive|drive_file_id|selected_drive_file_id|raw_photo_link|edited_photo_link|drive_link|driveSettingsHref|driveDayFolder|rawFolderDriveId/i

function filesUnder(directory: string): string[] {
  const absolute = join(root, directory)
  return readdirSync(absolute).flatMap((entry) => {
    const next = join(absolute, entry)
    const projectPath = relative(root, next).replaceAll('\\', '/')
    if ([...allowedFiles].some((allowed) => projectPath === allowed || projectPath.startsWith(`${allowed}/`))) return []
    return statSync(next).isDirectory() ? filesUnder(projectPath) : [projectPath]
  })
}

/**
 * Scenario: SC-001 — Retired provider regression scan
 * Requirement: REQ-R2-01
 * Priority: P0
 */
test('active runtime, UI, environment, and dependency sources contain no retired storage contract', () => {
  const candidates = [
    ...activeRoots.flatMap(filesUnder),
    ...activeFiles,
  ].filter((file) => /\.(?:ts|tsx|js|mjs|json|yaml|yml|example)$/.test(file) || file === '.env.example')

  const violations = candidates.flatMap((file) => {
    const lines = readFileSync(join(root, file), 'utf8').split(/\r?\n/)
    return lines.flatMap((line, index) => retiredPattern.test(line) ? [`${file}:${index + 1}: ${line.trim()}`] : [])
  })

  assert.deepEqual(violations, [], `Retired storage references remain:\n${violations.join('\n')}`)
})

/**
 * Scenario: SC-011 — Terminal R2-only schema contract
 * Requirement: REQ-R2-10 and REQ-R2-11
 * Priority: P0
 */
test('terminal migration is fail-closed and removes the retired schema without cascading data loss', () => {
  const additive = readFileSync(join(root, 'supabase/migrations/20260914142001_cleanup_legacy_storage.sql'), 'utf8')
  const cleanup = readFileSync(join(root, 'supabase/migrations/20260914142027_remove_retired_storage_contract.sql'), 'utf8')

  assert.match(additive, /create table if not exists public\.storage_settings/)
  assert.match(additive, /create table if not exists public\.storage_multipart_uploads/)
  assert.match(additive, /default 'legacy_external'/)
  assert.doesNotMatch(additive, /drop table if exists public\.google_drive_settings/i)

  assert.match(cleanup, /R2 cutover blocked:/)
  assert.match(cleanup, /lock table public\.gallery_files/)
  assert.match(cleanup, /storage_provider <> 'r2'/)
  assert.match(cleanup, /drop table if exists public\.drive_folders/)
  assert.match(cleanup, /drop table if exists public\.google_drive_settings/)
  assert.doesNotMatch(cleanup, /drop\s+(?:table|column)[^;]*cascade/i)
  assert.match(cleanup, /revoke all on public\.storage_settings, public\.storage_multipart_uploads[\s\S]*from public, anon, authenticated/)
  assert.match(cleanup, /grant all on public\.storage_settings, public\.storage_multipart_uploads[\s\S]*to service_role/)
})

/**
 * Scenario: SC-007 — Print lineage uses the R2 schema fields
 * Requirement: REQ-R2-06 and REQ-R2-07
 * Priority: P0
 */
test('print output persists both final and enhanced R2 lineage keys', () => {
  const source = readFileSync(join(root, 'lib/print-workflow.ts'), 'utf8')
  const selectionSource = readFileSync(join(root, 'lib/editor-workflow.ts'), 'utf8')
  assert.match(source, /print_storage_key:\s*output\.print_storage_key/)
  assert.match(source, /enhanced_storage_key:\s*output\.enhanced_storage_key/)
  assert.doesNotMatch(source, /\bstorage_key:\s*output\.print_storage_key/)
  assert.doesNotMatch(selectionSource, /label_snapshot:[\s\S]{0,180}\bstorage_key:\s*null/)
})

/**
 * Scenario: SC-014 — Browser upload CORS matches signed metadata
 * Requirement: REQ-R2-02
 * Priority: P0
 */
test('production R2 CORS permits every metadata header used by signed browser uploads', () => {
  const cors = JSON.parse(readFileSync(join(root, 'docs/storage/r2-cors.production.json'), 'utf8'))
  const headers = new Set<string>(cors.rules[0].allowed.headers)
  const signedUploadSource = readFileSync(join(root, 'lib/raw-upload-server.ts'), 'utf8')

  for (const header of [
    'content-type',
    'x-amz-meta-bookingid',
    'x-amz-meta-uploadkey',
    'x-amz-meta-generation',
    'x-amz-meta-filename',
    'x-amz-meta-sha256',
  ]) assert.equal(headers.has(header), true, `${header} must be allowed by production R2 CORS`)

  assert.match(signedUploadSource, /uploadkey:\s*uploadKey/)
  assert.match(signedUploadSource, /generation:\s*String\(generation\)/)
})

/**
 * Scenario: SC-015 — Presigned browser uploads do not bind an empty checksum
 * Requirement: REQ-R2-02
 * Priority: P0
 */
test('R2 signer disables optional request checksums for body-less presigning', () => {
  const source = readFileSync(join(root, 'lib/storage/r2-client.ts'), 'utf8')
  assert.match(source, /requestChecksumCalculation:\s*['"]WHEN_REQUIRED['"]/)
})

test('R2 upload URLs sign content type and keep metadata out of query parameters', () => {
  const source = readFileSync(join(root, 'lib/storage/presigned-urls.ts'), 'utf8')
  assert.match(source, /unhoistableHeaders:\s*metadataHeaderNames/)
  assert.match(source, /signableHeaders:\s*new Set\(\[['"]content-type['"]\]\)/)
})
