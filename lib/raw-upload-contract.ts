import { z } from 'zod'
import { MAX_RAW_UPLOAD_BYTES } from '@/lib/raw-upload-shared'
export { MAX_RAW_UPLOAD_BYTES, RawUploadError, validateRawSessionUrl } from '@/lib/raw-upload-shared'

export const rawUploadMetadataSchema = z.object({
  fileName: z.string().trim().min(1).max(120)
    .regex(/^[^\\/:*?"<>|\u0000-\u001f\u007f]+\.(?:jpe?g|png|gif|webp|tiff?|heic|heif|dng|cr2|cr3|nef|arw|orf|rw2|raf)$/i),
  fileSize: z.number().int().positive().max(MAX_RAW_UPLOAD_BYTES),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
}).strict()
export const rawUploadCompleteSchema = z.object({
  grant: z.string().min(20).max(6000),
  driveFileId: z.string().regex(/^[A-Za-z0-9_-]{1,200}$/),
}).strict()
export type RawUploadMetadata = z.infer<typeof rawUploadMetadataSchema>
