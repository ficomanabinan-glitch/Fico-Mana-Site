import 'server-only'
import { createHash } from 'node:crypto'
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  NoSuchKey,
  NotFound,
  PutObjectCommand,
  type GetObjectCommandOutput,
  type PutObjectCommandInput,
} from '@aws-sdk/client-s3'
import { getR2Client, StorageConfigurationError } from '@/lib/storage/r2-client'
import { parseStorageKey } from '@/lib/storage/storage-keys'

export class StorageError extends Error {
  constructor(
    message: string,
    public readonly code: 'CONFIGURATION' | 'NOT_FOUND' | 'FORBIDDEN' | 'INVALID' | 'UNAVAILABLE',
    public readonly status: number,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'StorageError'
  }
}

function normalizedEtag(value?: string) {
  return value?.replace(/^"|"$/g, '') || null
}

function mapStorageError(error: unknown): StorageError {
  if (error instanceof StorageError) return error
  if (error instanceof StorageConfigurationError) {
    return new StorageError('Private photo storage is not configured.', 'CONFIGURATION', 503, error)
  }
  const named = error as { name?: string; $metadata?: { httpStatusCode?: number } }
  const status = Number(named?.$metadata?.httpStatusCode || 0)
  if (error instanceof NoSuchKey || error instanceof NotFound || status === 404 || named?.name === 'NoSuchKey' || named?.name === 'NotFound') {
    return new StorageError('This file is currently unavailable.', 'NOT_FOUND', 404, error)
  }
  if (status === 401 || status === 403 || named?.name === 'AccessDenied') {
    return new StorageError('You do not have permission to access this file.', 'FORBIDDEN', 403, error)
  }
  return new StorageError('Private photo storage is temporarily unavailable.', 'UNAVAILABLE', 503, error)
}

function key(value: string) {
  parseStorageKey(value)
  return value
}

export type StoredObjectMetadata = {
  key: string
  contentType: string
  contentLength: number
  etag: string | null
  checksum: string | null
  metadata: Record<string, string>
  lastModified: Date | null
}

export async function uploadObject(input: {
  key: string
  body: PutObjectCommandInput['Body']
  contentType: string
  contentLength?: number
  checksum?: string
  metadata?: Record<string, string>
  cacheControl?: string
}) {
  const { client, bucket } = getR2Client()
  try {
    const response = await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key(input.key),
      Body: input.body,
      ContentType: input.contentType,
      ContentLength: input.contentLength,
      CacheControl: input.cacheControl,
      Metadata: {
        ...input.metadata,
        ...(input.checksum ? { sha256: input.checksum.toLowerCase() } : {}),
      },
    }))
    return { key: input.key, etag: normalizedEtag(response.ETag) }
  } catch (error) {
    throw mapStorageError(error)
  }
}

export async function getObjectMetadata(storageKey: string): Promise<StoredObjectMetadata> {
  const { client, bucket } = getR2Client()
  try {
    const response = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key(storageKey) }))
    return {
      key: storageKey,
      contentType: response.ContentType || 'application/octet-stream',
      contentLength: Number(response.ContentLength || 0),
      etag: normalizedEtag(response.ETag),
      checksum: response.Metadata?.sha256 || null,
      metadata: response.Metadata || {},
      lastModified: response.LastModified || null,
    }
  } catch (error) {
    throw mapStorageError(error)
  }
}

export async function objectExists(storageKey: string) {
  try {
    await getObjectMetadata(storageKey)
    return true
  } catch (error) {
    if (error instanceof StorageError && error.code === 'NOT_FOUND') return false
    throw error
  }
}

export async function getObject(storageKey: string): Promise<GetObjectCommandOutput> {
  const { client, bucket } = getR2Client()
  try {
    return await client.send(new GetObjectCommand({ Bucket: bucket, Key: key(storageKey) }))
  } catch (error) {
    throw mapStorageError(error)
  }
}

export async function readObject(storageKey: string, maximumBytes = 600 * 1024 * 1024) {
  const response = await getObject(storageKey)
  if (!response.Body) throw new StorageError('This file is currently unavailable.', 'NOT_FOUND', 404)
  if (Number(response.ContentLength || 0) > maximumBytes) throw new StorageError('This file is too large to process.', 'INVALID', 413)
  const bytes = Buffer.from(await response.Body.transformToByteArray())
  if (bytes.length > maximumBytes) throw new StorageError('This file is too large to process.', 'INVALID', 413)
  return bytes
}

export async function hashObjectSha256(storageKey: string, maximumBytes: number) {
  const data = await readObject(storageKey, maximumBytes)
  return { sha256: createHash('sha256').update(data).digest('hex'), size: data.length }
}

export async function copyObject(input: {
  sourceKey: string
  destinationKey: string
  contentType?: string
  metadata?: Record<string, string>
}) {
  const { client, bucket } = getR2Client()
  try {
    const encoded = `${bucket}/${input.sourceKey.split('/').map(encodeURIComponent).join('/')}`
    const response = await client.send(new CopyObjectCommand({
      Bucket: bucket,
      CopySource: encoded,
      Key: key(input.destinationKey),
      ContentType: input.contentType,
      MetadataDirective: input.metadata || input.contentType ? 'REPLACE' : 'COPY',
      Metadata: input.metadata,
    }))
    return { key: input.destinationKey, etag: normalizedEtag(response.CopyObjectResult?.ETag) }
  } catch (error) {
    throw mapStorageError(error)
  }
}

export async function deleteObject(storageKey: string) {
  const { client, bucket } = getR2Client()
  try {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key(storageKey) }))
  } catch (error) {
    throw mapStorageError(error)
  }
}

export async function deleteObjects(storageKeys: string[]) {
  if (!storageKeys.length) return { deleted: 0 }
  const { client, bucket } = getR2Client()
  let deleted = 0
  try {
    for (let index = 0; index < storageKeys.length; index += 1_000) {
      const batch = storageKeys.slice(index, index + 1_000).map((storageKey) => ({ Key: key(storageKey) }))
      const response = await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: batch, Quiet: true } }))
      if (response.Errors?.length) throw new Error(`R2 rejected ${response.Errors.length} object deletions.`)
      deleted += batch.length
    }
    return { deleted }
  } catch (error) {
    throw mapStorageError(error)
  }
}

export async function listObjects(prefix: string, options: { cursor?: string; limit?: number } = {}) {
  if (!prefix || prefix.startsWith('/') || prefix.includes('..') || prefix.includes('\\')) {
    throw new StorageError('The storage prefix is invalid.', 'INVALID', 400)
  }
  const { client, bucket } = getR2Client()
  try {
    const response = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      ContinuationToken: options.cursor,
      MaxKeys: Math.max(1, Math.min(1_000, options.limit || 1_000)),
    }))
    return {
      objects: (response.Contents || []).flatMap((item) => item.Key ? [{
        key: item.Key,
        size: Number(item.Size || 0),
        etag: normalizedEtag(item.ETag),
        lastModified: item.LastModified || null,
      }] : []),
      cursor: response.NextContinuationToken || null,
    }
  } catch (error) {
    throw mapStorageError(error)
  }
}

export async function listAllObjectKeys(prefix: string, maximumObjects = 20_000) {
  const keys: string[] = []
  let cursor: string | undefined
  do {
    const page = await listObjects(prefix, { cursor })
    keys.push(...page.objects.map((item) => item.key))
    if (keys.length > maximumObjects) throw new StorageError('This storage operation is too large.', 'INVALID', 413)
    cursor = page.cursor || undefined
  } while (cursor)
  return keys
}
