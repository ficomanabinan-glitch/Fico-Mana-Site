import type { SupabaseClient } from '@supabase/supabase-js'
import { getDriveFile, GoogleDriveRequestError, hashDriveFileSha256, type DriveFile } from '@/lib/google-drive'

/** Only intentionally client-safe messages may cross the portal API boundary. */
export class PortalSelectionError extends Error {
  constructor(message: string, readonly code: string, readonly status = 409) {
    super(message)
    this.name = 'PortalSelectionError'
  }
}

type GallerySource = { id: string; drive_file_id: string; file_name: string; file_size: number | null; checksum: string | null }
const MAX_VERIFICATION_BYTES = 100 * 1024 * 1024

async function availableFile(id: string): Promise<DriveFile | null> {
  try {
    const file = await getDriveFile(id)
    return file.trashed || file.mimeType.startsWith('application/vnd.google-apps.') || file.appProperties?.rawVerification === 'pending' ? null : file
  } catch (error) {
    // Permission, quota and service errors must not be mistaken for deleted files.
    if (error instanceof GoogleDriveRequestError && error.status === 404) return null
    throw error
  }
}

/** Resolve missing originals without replacing the client's gallery IDs or modifying any original. */
export async function resolvePortalSelectionSources(
  admin: SupabaseClient,
  workspaceId: string,
  bookingId: string,
  rawFolderId: string,
  gallery: GallerySource[],
) {
  const sources = new Map<string, string>()
  for (const file of gallery) {
    if (await availableFile(file.drive_file_id)) {
      sources.set(file.id, file.drive_file_id)
      continue
    }
    const checksum = String(file.checksum || '').toLowerCase()
    const size = Number(file.file_size)
    if (/^(?:[a-f0-9]{32}|[a-f0-9]{64})$/.test(checksum) && Number.isSafeInteger(size) && size > 0 && size <= MAX_VERIFICATION_BYTES) {
      const { data: candidates, error } = await admin.from('gallery_files')
        .select('drive_file_id')
        .eq('workspace_id', workspaceId).eq('booking_id', bookingId)
        .eq('file_name', file.file_name).eq('file_size', size)
        .order('created_at', { ascending: false }).limit(10)
      if (error) throw new Error(error.message)
      for (const candidate of candidates || []) {
        const id = String(candidate.drive_file_id)
        if (id === file.drive_file_id) continue
        const replacement = await availableFile(id)
        if (!replacement || replacement.name !== file.file_name || Number(replacement.size) !== size || !replacement.parents?.includes(rawFolderId)) continue
        if (replacement.appProperties?.bookingId && replacement.appProperties.bookingId !== bookingId) continue
        // A matching filename alone is never enough. Check Drive's actual content checksum.
        let actual = checksum.length === 64 ? replacement.sha256Checksum : replacement.md5Checksum
        if (!actual && checksum.length === 64) {
          const verified = await hashDriveFileSha256(id, size)
          if (verified.bytes !== size) continue
          actual = verified.checksum
        }
        if (actual?.toLowerCase() === checksum) {
          sources.set(file.id, id)
          break
        }
      }
    }
    if (!sources.has(file.id)) {
      const name = file.file_name.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 180)
      throw new PortalSelectionError(
        `The original photo ${name} is no longer available. Try: ask the studio to restore or re-upload the original to your RAW folder and click Sync Drive, then submit your selection again.`,
        'SELECTION_ORIGINAL_UNAVAILABLE',
      )
    }
  }
  return sources
}
