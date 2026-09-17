import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './helpers/load-ts.ts'
import { memoryDb } from './helpers/memory-db.ts'
import * as storageKeys from '../lib/storage/storage-keys.ts'

class RawUploadError extends Error {
  status: number
  constructor(message: string, status = 409) {
    super(message)
    this.status = status
  }
}
class StorageError extends Error {
  code: string
  status: number
  constructor(message: string, code: string, status: number) {
    super(message)
    this.code = code
    this.status = status
  }
}

const ctx = { workspaceId: 'ws', bookingId: 'ONE', actorId: 'staff' }
const prefix = 'workspaces/ws/shoots/2026/09/14/ONE'
const rawKey = `${prefix}/raw/photo.jpg`
const previewKey = `${prefix}/preview/photo.webp`
const thumbnailKey = `${prefix}/thumbnail/photo.webp`

function fixture() {
  const db = memoryDb({
    photo_selections: [{ id: 'selection', workspace_id: 'ws', booking_id: 'ONE', status: 'COPY_FAILED', raw_upload_generation: 0 }],
    editing_jobs: [{ workspace_id: 'ws', booking_id: 'ONE', status: 'WAITING_FOR_SELECTION' }],
    gallery_files: [{
      id: 'photo', workspace_id: 'ws', booking_id: 'ONE', storage_provider: 'r2', storage_status: 'available',
      storage_key: rawKey, file_name: 'photo.JPG', preview_reference: previewKey, thumbnail_reference: thumbnailKey,
    }],
    photo_selection_items: [], print_allocations: [], deliverable_files: [], onsite_photo_resets: [],
  })
  const objects: Record<string, { etag: string; contentLength: number }> = {
    [rawKey]: { etag: 'raw-etag', contentLength: 100 },
    [previewKey]: { etag: 'preview-etag', contentLength: 20 },
    [thumbnailKey]: { etag: 'thumbnail-etag', contentLength: 10 },
  }
  const deleted: string[] = []
  let failure = ''
  let started = 0
  const admin = {
    ...db,
    rpc: async (name: string, args: any) => {
      if (name === 'begin_onsite_photo_reset') {
        started++
        db.tables.photo_selections[0].raw_reset_id = 'reset'
        db.tables.onsite_photo_resets = [{
          id: 'reset', workspace_id: 'ws', booking_id: 'ONE', state: 'RUNNING', targets: args.p_targets, completed_ids: [],
        }]
        return { data: 'reset', error: null }
      }
      const reset = db.tables.onsite_photo_resets[0]
      if (name === 'record_onsite_photo_reset_progress') {
        reset.completed_ids = [...new Set([...reset.completed_ids, ...args.p_completed])]
        return { data: reset.completed_ids.length, error: null }
      }
      if (name === 'finish_onsite_photo_reset') {
        reset.state = 'COMPLETED'
        db.tables.gallery_files = []
        db.tables.photo_selections[0].raw_reset_id = null
        return { error: null }
      }
      throw new Error(name)
    },
  }
  const code = loadTs<typeof import('../lib/onsite-photo-reset.ts')>('lib/onsite-photo-reset.ts', {
    '@/lib/supabase/admin': { getSupabaseAdmin: () => admin },
    '@/lib/raw-upload-contract': { RawUploadError },
    '@/lib/package-workflow-server': { assertGraduationBooking: async () => {} },
    '@/lib/storage/storage-keys': storageKeys,
    '@/lib/storage/storage-service': {
      StorageError,
      getObjectMetadata: async (key: string) => {
        if (failure === `read:${key}`) throw new StorageError('Synthetic storage failure', 'UNAVAILABLE', 503)
        if (!objects[key]) throw new StorageError('Missing object', 'NOT_FOUND', 404)
        return objects[key]
      },
      deleteObject: async (key: string) => {
        if (failure === key) throw new StorageError('Synthetic storage failure', 'UNAVAILABLE', 503)
        deleted.push(key)
        delete objects[key]
      },
    },
  })
  return {
    db, objects, deleted, code,
    setFailure: (value: string) => { failure = value },
    get started() { return started },
    begin: () => code.beginOnsitePhotoReset(ctx),
    resume: () => code.continueOnsitePhotoReset(ctx, 'reset'),
  }
}

test('Delete Files removes only the booking original and derivatives, then retries idempotently', async () => {
  const f = fixture()
  await f.begin()
  assert.equal(f.deleted.length, 0, 'Preparing is read-only')
  assert.equal((await f.resume()).complete, true)
  assert.deepEqual(new Set(f.deleted), new Set([rawKey, previewKey, thumbnailKey]))
  await f.resume()
  assert.equal(f.deleted.length, 3, 'Completed reset never deletes objects twice')
})

test('already-missing R2 objects clear stale metadata without failing the reset', async () => {
  const f = fixture()
  delete f.objects[rawKey]
  delete f.objects[previewKey]
  delete f.objects[thumbnailKey]
  await f.begin()
  assert.equal((await f.resume()).complete, true)
  assert.equal(f.db.tables.gallery_files.length, 0)
  assert.deepEqual(f.deleted, [])
})

test('R2 failure or changed object metadata keeps reset pending and retry resumes saved work', async () => {
  const f = fixture()
  await f.begin()
  f.setFailure(rawKey)
  await assert.rejects(f.resume(), /Some photos could not be cleared/)
  assert.equal(f.db.tables.gallery_files.length, 1)
  f.setFailure('')
  assert.equal((await f.resume()).complete, true)

  const changed = fixture()
  await changed.begin()
  changed.objects[rawKey].etag = 'changed-after-review'
  await assert.rejects(changed.resume(), /Some photos could not be cleared/i)
  assert.equal(changed.deleted.length, 0)
})

test('foreign keys, shared metadata, and R2 errors fail before reset starts', async () => {
  for (const mode of ['foreign', 'shared', 'r2'] as const) {
    const f = fixture()
    if (mode === 'foreign') f.db.tables.gallery_files[0].storage_key = 'workspaces/ws/shoots/2026/09/14/TWO/raw/photo.jpg'
    if (mode === 'shared') f.db.tables.deliverable_files.push({ id: 'shared', booking_id: 'TWO', storage_key: rawKey })
    if (mode === 'r2') f.setFailure(`read:${rawKey}`)
    await assert.rejects(f.begin())
    assert.equal(f.started, 0)
    assert.equal(f.deleted.length, 0)
  }
})
