import 'server-only'
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { getR2Client } from '@/lib/storage/r2-client'
import { DEFAULT_SIGNED_URL_SECONDS } from '@/lib/storage/presigned-urls'
import { parseStorageKey } from '@/lib/storage/storage-keys'

export const MULTIPART_PART_BYTES = 8 * 1024 * 1024
export const MULTIPART_THRESHOLD_BYTES = 16 * 1024 * 1024
const uploadIdPattern = /^[A-Za-z0-9+/=_-]{8,2048}$/

function validateUploadId(uploadId: string) {
  if (!uploadIdPattern.test(uploadId)) throw new Error('The multipart upload ID is invalid.')
  return uploadId
}

export async function createMultipartUpload(input: {
  key: string
  contentType: string
  checksum?: string
  metadata?: Record<string, string>
}) {
  parseStorageKey(input.key)
  const { client, bucket } = getR2Client()
  const response = await client.send(new CreateMultipartUploadCommand({
    Bucket: bucket,
    Key: input.key,
    ContentType: input.contentType,
    Metadata: {
      ...input.metadata,
      ...(input.checksum ? { sha256: input.checksum.toLowerCase() } : {}),
    },
  }))
  if (!response.UploadId) throw new Error('R2 did not create the multipart upload.')
  return { key: input.key, uploadId: response.UploadId }
}

export async function createMultipartPartUrl(input: {
  key: string
  uploadId: string
  partNumber: number
  expiresIn?: number
}) {
  parseStorageKey(input.key)
  validateUploadId(input.uploadId)
  if (!Number.isInteger(input.partNumber) || input.partNumber < 1 || input.partNumber > 10_000) {
    throw new Error('The multipart part number is invalid.')
  }
  const { client, bucket } = getR2Client()
  return getSignedUrl(client, new UploadPartCommand({
    Bucket: bucket,
    Key: input.key,
    UploadId: input.uploadId,
    PartNumber: input.partNumber,
  }), { expiresIn: input.expiresIn || DEFAULT_SIGNED_URL_SECONDS })
}

export async function completeMultipartUpload(input: {
  key: string
  uploadId: string
  parts: Array<{ partNumber: number; etag: string }>
}) {
  parseStorageKey(input.key)
  validateUploadId(input.uploadId)
  const parts = [...input.parts].sort((left, right) => left.partNumber - right.partNumber)
  if (!parts.length || parts.length > 10_000 || parts.some((part, index) =>
    part.partNumber !== index + 1 || !/^"?[A-Fa-f0-9-]{8,160}"?$/.test(part.etag))) {
    throw new Error('The multipart completion list is invalid.')
  }
  const { client, bucket } = getR2Client()
  const response = await client.send(new CompleteMultipartUploadCommand({
    Bucket: bucket,
    Key: input.key,
    UploadId: input.uploadId,
    MultipartUpload: { Parts: parts.map((part) => ({ PartNumber: part.partNumber, ETag: part.etag })) },
  }))
  return { key: input.key, etag: response.ETag?.replace(/^"|"$/g, '') || null }
}

export async function abortMultipartUpload(input: { key: string; uploadId: string }) {
  parseStorageKey(input.key)
  validateUploadId(input.uploadId)
  const { client, bucket } = getR2Client()
  await client.send(new AbortMultipartUploadCommand({
    Bucket: bucket,
    Key: input.key,
    UploadId: input.uploadId,
  }))
}
