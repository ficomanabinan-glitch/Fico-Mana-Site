import 'server-only'
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { getR2Client } from '@/lib/storage/r2-client'
import { parseStorageKey } from '@/lib/storage/storage-keys'

export const DEFAULT_SIGNED_URL_SECONDS = 10 * 60

function expiry(value?: number) {
  const seconds = value || DEFAULT_SIGNED_URL_SECONDS
  if (!Number.isInteger(seconds) || seconds < 60 || seconds > 60 * 60) {
    throw new Error('Signed URL expiry must be between 60 and 3,600 seconds.')
  }
  return seconds
}

function dispositionFileName(value: string) {
  return value.normalize('NFKC').replace(/[\r\n"\\]/g, '_').slice(0, 180) || 'download'
}

export async function createDownloadUrl(input: {
  key: string
  expiresIn?: number
  downloadName?: string
  inline?: boolean
}) {
  parseStorageKey(input.key)
  const { client, bucket } = getR2Client()
  const disposition = input.downloadName
    ? `${input.inline ? 'inline' : 'attachment'}; filename="${dispositionFileName(input.downloadName)}"`
    : undefined
  return getSignedUrl(client, new GetObjectCommand({
    Bucket: bucket,
    Key: input.key,
    ResponseContentDisposition: disposition,
  }), { expiresIn: expiry(input.expiresIn) })
}

export async function createUploadUrl(input: {
  key: string
  contentType: string
  expiresIn?: number
  checksum?: string
  metadata?: Record<string, string>
}) {
  parseStorageKey(input.key)
  const { client, bucket } = getR2Client()
  const headers = {
    ...input.metadata,
    ...(input.checksum ? { sha256: input.checksum.toLowerCase() } : {}),
  }
  const metadataHeaderNames = new Set(
    Object.keys(headers).map((name) => `x-amz-meta-${name.toLowerCase()}`),
  )
  const url = await getSignedUrl(client, new PutObjectCommand({
    Bucket: bucket,
    Key: input.key,
    ContentType: input.contentType,
    Metadata: headers,
  }), {
    expiresIn: expiry(input.expiresIn),
    // Keep metadata in exactly one place: signed request headers. Without this,
    // the SDK hoists the values into the URL while the browser also sends them
    // as headers, which R2 can reject as an ambiguous request.
    unhoistableHeaders: metadataHeaderNames,
    // Cloudflare requires the browser's Content-Type to match the value used
    // when the upload URL is signed.
    signableHeaders: new Set(['content-type']),
  })
  return { url, headers: { 'Content-Type': input.contentType, ...Object.fromEntries(Object.entries(headers).map(([name, value]) => [`x-amz-meta-${name}`, value])) } }
}
