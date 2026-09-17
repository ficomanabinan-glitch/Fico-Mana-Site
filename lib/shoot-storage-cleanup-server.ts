import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  CLEANUP_CHUNK_SIZE, cleanupDateRange, cleanupFingerprint, runCleanupChunk, signCleanupGrant, validateCleanupFile,
  type CleanupCategory, type CleanupFile, type CleanupGrant, type CleanupRange,
} from '@/lib/shoot-storage-cleanup'
import { runCleanupFolder, signCleanupFolderGrant, type CleanupFolderGrant } from '@/lib/shoot-folder-cleanup'
import { assertStorageKeyOwnership, bookingStoragePrefix } from '@/lib/storage/storage-keys'
import { deleteObject, deleteObjects, getObjectMetadata, listAllObjectKeys, listObjects, StorageError } from '@/lib/storage/storage-service'

type ListedObject = { key: string; size: number; etag: string | null; lastModified: Date | null }

export async function listCleanupShoots(admin: SupabaseClient, workspaceId: string, range: CleanupRange, cursor: string) {
  const dates = cleanupDateRange(range)
  let query = admin.from('bookings')
    .select('id,customer_name,booking_date,booking_provisioning!inner(storage_prefix,storage_provider,storage_status)')
    .eq('workspace_id', workspaceId).eq('booking_provisioning.storage_provider', 'r2')
    .not('booking_provisioning.storage_prefix', 'is', null).order('id').limit(100)
  if (dates.from && dates.to) query = query.gte('booking_date', dates.from).lte('booking_date', dates.to)
  if (cursor) query = query.gt('id', cursor)
  const result = await query
  if (result.error) throw new Error('Shoot list is unavailable.')
  const shoots = (result.data || []).map(row => ({ id: String(row.id), name: String(row.customer_name), date: String(row.booking_date) }))
  return { shoots, nextCursor: shoots.length === 100 ? shoots.at(-1)!.id : null, dates }
}

async function shootContext(admin: SupabaseClient, workspaceId: string, bookingId: string) {
  const [booking, provisioning, uploading] = await Promise.all([
    admin.from('bookings').select('id,booking_date,customer_name').eq('workspace_id', workspaceId).eq('id', bookingId).single(),
    admin.from('booking_provisioning').select('storage_provider,storage_prefix,storage_status')
      .eq('workspace_id', workspaceId).eq('booking_id', bookingId).single(),
    admin.from('editing_jobs').select('id').eq('workspace_id', workspaceId).eq('booking_id', bookingId).eq('status', 'UPLOADING').limit(1),
  ])
  if (booking.error || provisioning.error || uploading.error || !booking.data || !provisioning.data) {
    throw new Error('Shoot storage records are unavailable.')
  }
  if (uploading.data?.length) throw new Error('An upload is running for this shoot. Wait until it finishes.')
  const expected = bookingStoragePrefix({ workspaceId, bookingId, shootDate: String(booking.data.booking_date) })
  if (provisioning.data.storage_provider !== 'r2' || provisioning.data.storage_prefix !== expected) {
    throw new Error('Shoot storage is not prepared in the private R2 namespace.')
  }
  return { booking: booking.data, prefix: `${expected}/` }
}

async function listedObjects(prefix: string) {
  const objects: ListedObject[] = []
  let cursor: string | undefined
  do {
    const page = await listObjects(prefix, { cursor })
    objects.push(...page.objects)
    if (objects.length > 20_000) throw new Error('This shoot has too many files for one cleanup review.')
    cursor = page.cursor || undefined
  } while (cursor)
  return objects
}

function treeFingerprint(objects: ListedObject[]) {
  return createHash('sha256').update(JSON.stringify(objects
    .map(item => [item.key, item.size, item.etag || '', item.lastModified?.toISOString() || ''])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'en')))).digest('hex')
}

async function metadataTargets(admin: SupabaseClient, workspaceId: string, bookingId: string, categories: CleanupCategory[]) {
  const requests: PromiseLike<{ data: any; error: any }>[] = []
  const labels: CleanupCategory[] = []
  if (categories.includes('RAW')) {
    requests.push(admin.from('gallery_files').select('storage_key,file_name,thumbnail_reference,preview_reference')
      .eq('workspace_id', workspaceId).eq('booking_id', bookingId).eq('storage_provider', 'r2').eq('storage_status', 'available'))
    labels.push('RAW')
  }
  if (categories.includes('SELECTED')) {
    requests.push(admin.from('print_allocations').select('print_storage_key,label_snapshot')
      .eq('workspace_id', workspaceId).eq('booking_id', bookingId).eq('storage_provider', 'r2').eq('storage_status', 'available'))
    labels.push('SELECTED')
  }
  if (categories.includes('EDITED')) {
    requests.push(admin.from('batch_upload_files').select('storage_key,file_name,batch_upload_items!inner(booking_id)')
      .eq('batch_upload_items.booking_id', bookingId).eq('storage_provider', 'r2').in('status', ['UPLOADED', 'SKIPPED_DUPLICATE']))
    labels.push('EDITED')
  }
  if (categories.includes('DELIVERABLES')) {
    requests.push(admin.from('deliverable_files').select('storage_key,file_name')
      .eq('workspace_id', workspaceId).eq('booking_id', bookingId).eq('storage_provider', 'r2').eq('storage_status', 'available'))
    labels.push('DELIVERABLES')
  }
  const settled = await Promise.all(requests)
  if (settled.some(item => item.error)) throw new Error('Shoot file records are unavailable.')
  const targets = new Map<string, { name: string; category: CleanupCategory }>()
  settled.forEach((result, index) => {
    const category = labels[index]
    for (const row of result.data || []) {
      const values = category === 'RAW'
        ? [[row.storage_key, row.file_name], [row.preview_reference, `${row.file_name} preview`], [row.thumbnail_reference, `${row.file_name} thumbnail`]]
        : category === 'SELECTED'
          ? [[row.print_storage_key, row.label_snapshot]]
          : [[row.storage_key, row.file_name]]
      for (const [value, name] of values) {
        const key = String(value || '')
        if (!key) continue
        assertStorageKeyOwnership(key, workspaceId, bookingId)
        targets.set(key, { name: String(name || key.split('/').at(-1)), category })
      }
    }
  })
  return targets
}

export async function previewCleanupShoot(
  admin: SupabaseClient, workspaceId: string, actorId: string, bookingId: string,
  range: CleanupRange, categories: CleanupCategory[],
) {
  const context = await shootContext(admin, workspaceId, bookingId)
  const dates = cleanupDateRange(range)
  const date = String(context.booking.booking_date)
  if (dates.from && dates.to && (date < dates.from || date > dates.to)) throw new Error('Shoot is outside the selected time range.')
  const [registered, objects] = await Promise.all([metadataTargets(admin, workspaceId, bookingId, categories), listedObjects(context.prefix)])
  const live = new Map(objects.map(item => [item.key, item]))
  const files: CleanupFile[] = []
  for (const [storageKey, target] of registered) {
    const object = live.get(storageKey)
    if (!object) continue
    files.push({
      id: storageKey, storageKey, name: target.name, category: target.category,
      fingerprint: cleanupFingerprint({ size: object.size, etag: object.etag, lastModified: object.lastModified }),
    })
  }
  const expiresAt = Date.now() + 10 * 60 * 1000
  const chunks = []
  for (let index = 0; index < files.length; index += CLEANUP_CHUNK_SIZE) {
    const batch = files.slice(index, index + CLEANUP_CHUNK_SIZE)
    chunks.push({
      token: signCleanupGrant({ version: 2, workspaceId, actorId, bookingId, shootDate: date, files: batch, expiresAt }),
      files: batch.map(file => ({ id: file.id, name: file.name, category: file.category })),
    })
  }
  return { bookingId, name: String(context.booking.customer_name), date, chunks, skippedShortcuts: 0, expiresAt }
}

export async function previewCleanupShootFolder(
  admin: SupabaseClient, workspaceId: string, actorId: string, bookingId: string, range: CleanupRange,
) {
  const context = await shootContext(admin, workspaceId, bookingId)
  const dates = cleanupDateRange(range)
  const date = String(context.booking.booking_date)
  if (dates.from && dates.to && (date < dates.from || date > dates.to)) throw new Error('Shoot is outside the selected time range.')
  const objects = await listedObjects(context.prefix)
  const expiresAt = Date.now() + 10 * 60 * 1000
  const grant: CleanupFolderGrant = {
    version: 2, kind: 'shoot_namespace', workspaceId, actorId, bookingId, storagePrefix: context.prefix,
    shootDate: date, expiresAt, treeFingerprint: treeFingerprint(objects), fileCount: objects.length,
  }
  return {
    bookingId, name: String(context.booking.customer_name), date, expiresAt, skippedShortcuts: 0,
    chunks: [{ token: signCleanupFolderGrant(grant), files: objects.slice(0, 1).map(item => ({ id: item.key, name: item.key.split('/').at(-1) || item.key, category: 'RAW' as const })) }],
    folder: { id: context.prefix, name: bookingId, fileCount: objects.length, subfolderCount: 0, shortcutCount: 0 },
  }
}

async function disablePortal(admin: SupabaseClient, workspaceId: string, bookingId: string) {
  const { error } = await admin.from('client_portals').update({ status: 'revoked' })
    .eq('workspace_id', workspaceId).eq('booking_id', bookingId)
  if (error) throw new Error('The client portal could not be disabled.')
}

async function markStorageKeyDeleted(admin: SupabaseClient, workspaceId: string, bookingId: string, storageKey: string) {
  await Promise.all([
    admin.from('gallery_files').update({ storage_status: 'deleted', updated_at: new Date().toISOString() })
      .eq('workspace_id', workspaceId).eq('booking_id', bookingId)
      .or(`storage_key.eq.${storageKey},preview_reference.eq.${storageKey},thumbnail_reference.eq.${storageKey}`),
    admin.from('deliverable_files').update({ storage_status: 'deleted', updated_at: new Date().toISOString() })
      .eq('workspace_id', workspaceId).eq('booking_id', bookingId).eq('storage_key', storageKey),
    admin.from('print_allocations').update({ storage_status: 'deleted' })
      .eq('workspace_id', workspaceId).eq('booking_id', bookingId).eq('print_storage_key', storageKey),
  ])
}

export async function executeCleanupShoot(admin: SupabaseClient, grant: CleanupGrant) {
  await shootContext(admin, grant.workspaceId, grant.bookingId)
  return runCleanupChunk(grant, {
    validate: async file => {
      try {
        const metadata = await getObjectMetadata(file.storageKey)
        return validateCleanupFile(file, {
          key: file.storageKey, contentType: metadata.contentType, size: metadata.contentLength,
          etag: metadata.etag, lastModified: metadata.lastModified,
        })
      } catch (error) {
        if (error instanceof StorageError && error.code === 'NOT_FOUND') return 'deleted'
        throw error
      }
    },
    auditStart: async () => {
      const { error } = await admin.from('workflow_audit_logs').insert({
        workspace_id: grant.workspaceId, actor_type: 'staff', actor_id: grant.actorId,
        action: 'R2_SHOOT_FILE_DELETE_STARTED', booking_id: grant.bookingId,
        metadata: { storageKeys: grant.files.map(file => file.storageKey) },
      })
      if (error) throw new Error('The cleanup audit could not be saved.')
    },
    disablePortal: () => disablePortal(admin, grant.workspaceId, grant.bookingId),
    remove: async file => { await deleteObject(file.storageKey); await markStorageKeyDeleted(admin, grant.workspaceId, grant.bookingId, file.storageKey) },
    auditResult: async results => {
      await admin.from('workflow_audit_logs').insert({
        workspace_id: grant.workspaceId, actor_type: 'staff', actor_id: grant.actorId,
        action: 'R2_SHOOT_FILE_DELETE_COMPLETED', booking_id: grant.bookingId, metadata: { results },
      })
    },
  })
}

export async function executeCleanupShootFolder(admin: SupabaseClient, grant: CleanupFolderGrant) {
  const context = await shootContext(admin, grant.workspaceId, grant.bookingId)
  if (context.prefix !== grant.storagePrefix) throw new Error('Shoot namespace changed. Review again.')
  return runCleanupFolder(grant, {
    validate: async () => {
      const objects = await listedObjects(grant.storagePrefix)
      if (objects.length !== grant.fileCount || treeFingerprint(objects) !== grant.treeFingerprint) {
        throw new Error('Shoot files changed since review. Review again.')
      }
    },
    auditStart: async () => {
      const { error } = await admin.from('workflow_audit_logs').insert({
        workspace_id: grant.workspaceId, actor_type: 'staff', actor_id: grant.actorId,
        action: 'R2_SHOOT_NAMESPACE_DELETE_STARTED', booking_id: grant.bookingId,
        metadata: { storagePrefix: grant.storagePrefix, fileCount: grant.fileCount },
      })
      if (error) throw new Error('The cleanup audit could not be saved.')
    },
    disablePortal: () => disablePortal(admin, grant.workspaceId, grant.bookingId),
    remove: async () => {
      const keys = await listAllObjectKeys(grant.storagePrefix, 20_000)
      await deleteObjects(keys)
      const timestamp = new Date().toISOString()
      await Promise.all([
        admin.from('gallery_files').update({ storage_status: 'deleted', updated_at: timestamp }).eq('workspace_id', grant.workspaceId).eq('booking_id', grant.bookingId),
        admin.from('deliverable_files').update({ storage_status: 'deleted', updated_at: timestamp }).eq('workspace_id', grant.workspaceId).eq('booking_id', grant.bookingId),
        admin.from('print_allocations').update({ storage_status: 'deleted' }).eq('workspace_id', grant.workspaceId).eq('booking_id', grant.bookingId),
        admin.from('booking_provisioning').update({ storage_status: 'deleted', updated_at: timestamp }).eq('workspace_id', grant.workspaceId).eq('booking_id', grant.bookingId),
      ])
    },
    auditResult: async results => {
      await admin.from('workflow_audit_logs').insert({
        workspace_id: grant.workspaceId, actor_type: 'staff', actor_id: grant.actorId,
        action: 'R2_SHOOT_NAMESPACE_DELETE_COMPLETED', booking_id: grant.bookingId, metadata: { results },
      })
    },
  })
}
