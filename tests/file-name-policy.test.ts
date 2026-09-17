import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { hasSameFileName, hasSameFolderFilePath } from '../lib/storage/file-name-policy.ts'

test('client-folder duplicate names are case-insensitive and Unicode-normalized', () => {
  assert.equal(hasSameFileName(' BNI00371.JPG ', 'bni00371.jpg'), true)
  assert.equal(hasSameFileName('Jos\u00e9.JPG', 'Jose\u0301.jpg'), true)
  assert.equal(hasSameFileName('BNI00371.JPG', 'BNI00372.JPG'), false)
  assert.equal(hasSameFolderFilePath('EDITED\\Client\\Photo.JPG', 'edited/client/photo.jpg'), true)
  assert.equal(hasSameFolderFilePath('client-a/photo.jpg', 'client-b/photo.jpg'), false)
})

test('database triggers serialize and reject duplicate names without deleting historical rows', async () => {
  const migration = await readFile('supabase/migrations/20260915135032_prevent_duplicate_client_filenames.sql', 'utf8')
  assert.match(migration, /pg_advisory_xact_lock/)
  assert.match(migration, /prevent_duplicate_gallery_filename/)
  assert.match(migration, /prevent_duplicate_deliverable_path/)
  assert.match(migration, /storage_status = 'available'/)
  assert.doesNotMatch(migration, /delete\s+from\s+public\.(gallery_files|deliverable_files)/i)
})

test('duplicate-name migration executes and rejects a second available file in the same client folder', async () => {
  const db = new PGlite()
  await db.exec(`
    create schema if not exists public;
    create table public.gallery_files (
      id uuid primary key, workspace_id uuid not null, booking_id text not null,
      file_name text not null, storage_status text not null
    );
    create table public.deliverable_files (
      id uuid primary key, workspace_id uuid not null, booking_id text not null,
      relative_path text not null, storage_status text not null
    );
    create role anon; create role authenticated; create role service_role;
  `)
  const migration = await readFile('supabase/migrations/20260915135032_prevent_duplicate_client_filenames.sql', 'utf8')
  await db.exec(migration)
  const workspace = '00000000-0000-4000-8000-000000000001'
  await db.exec(`insert into public.gallery_files values ('00000000-0000-4000-8000-000000000002','${workspace}','FM-1','Photo.JPG','available')`)
  await assert.rejects(
    db.exec(`insert into public.gallery_files values ('00000000-0000-4000-8000-000000000003','${workspace}','FM-1','photo.jpg','available')`),
    /already exists in this client folder/,
  )
  await db.close()
})

test('original and enhanced upload paths reject a conflicting same-folder filename', async () => {
  const [raw, enhanced] = await Promise.all([
    readFile('lib/raw-upload-server.ts', 'utf8'),
    readFile('lib/editor-workflow.ts', 'utf8'),
  ])
  assert.match(raw, /hasSameFileName/)
  assert.match(raw, /Rename the new file before uploading/)
  assert.match(enhanced, /hasSameFolderFilePath/)
  assert.match(enhanced, /Rename the new file before uploading/)
})
