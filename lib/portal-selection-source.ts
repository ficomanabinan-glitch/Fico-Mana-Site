import type { SupabaseClient } from '@supabase/supabase-js'
import { assertStorageKeyOwnership } from '@/lib/storage/storage-keys'
import { getObjectMetadata, hashObjectSha256, StorageError } from '@/lib/storage/storage-service'

/** Only intentionally client-safe messages may cross the portal API boundary. */
export class PortalSelectionError extends Error {
  constructor(message: string, readonly code: string, readonly status = 409) {
    super(message)
    this.name = 'PortalSelectionError'
  }
}

type GallerySource = {
  id: string
  storage_key: string
  storage_status?: string | null
  file_name: string
  file_size: number | null
  checksum: string | null
}

const MAX_VERIFICATION_BYTES = 100 * 1024 * 1024

async function availableObject(workspaceId: string, bookingId: string, storageKey: string) {
  try {
    assertStorageKeyOwnership(storageKey, workspaceId, bookingId)
    return await getObjectMetadata(storageKey)
  } catch (error) {
    if (error instanceof StorageError && error.code === 'NOT_FOUND') return null
    throw error
  }
}

/** Resolve missing originals without replacing the client's gallery IDs or modifying any original. */
export async function resolvePortalSelectionSources(
  admin: SupabaseClient,
  workspaceId: string,
  bookingId: string,
  gallery: GallerySource[],
) {
  const sources = new Map<string, string>()
  for (const file of gallery) {
    if (file.storage_status === 'available' && await availableObject(workspaceId, bookingId, file.storage_key)) {
      sources.set(file.id, file.storage_key)
      continue
    }

    const checksum = String(file.checksum || '').toLowerCase()
    const size = Number(file.file_size)
    if (/^[a-f0-9]{64}$/.test(checksum) && Number.isSafeInteger(size) && size > 0 && size <= MAX_VERIFICATION_BYTES) {
      const { data: candidates, error } = await admin
        .from('gallery_files')
        .select('storage_key,file_size,checksum')
        .eq('workspace_id', workspaceId)
        .eq('booking_id', bookingId)
        .eq('file_name', file.file_name)
        .eq('file_size', size)
        .eq('storage_status', 'available')
        .order('created_at', { ascending: false })
        .limit(10)
      if (error) throw new Error(error.message)

      for (const candidate of candidates || []) {
        const storageKey = String(candidate.storage_key || '')
        if (!storageKey || storageKey === file.storage_key) continue
        const object = await availableObject(workspaceId, bookingId, storageKey)
        if (!object || object.contentLength !== size) continue
        let actual = String(object.checksum || candidate.checksum || '').toLowerCase()
        if (!/^[a-f0-9]{64}$/.test(actual)) {
          const verified = await hashObjectSha256(storageKey, size)
          if (verified.size !== size) continue
          actual = verified.sha256
        }
        if (actual === checksum) {
          sources.set(file.id, storageKey)
          break
        }
      }
    }

    if (!sources.has(file.id)) {
      const name = file.file_name.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 180)
      throw new PortalSelectionError(
        `The original photo ${name} is no longer available. Try: ask the studio to restore or re-upload it, refresh the files, then submit your selection again.`,
        'SELECTION_ORIGINAL_UNAVAILABLE',
      )
    }
  }
  return sources
}
