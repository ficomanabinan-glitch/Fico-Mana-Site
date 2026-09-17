import 'server-only'
import { S3Client } from '@aws-sdk/client-s3'

export class StorageConfigurationError extends Error {
  constructor(message = 'Private photo storage is not configured.') {
    super(message)
    this.name = 'StorageConfigurationError'
  }
}

export type R2Configuration = {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  endpoint: string
}

function required(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new StorageConfigurationError(`${name} is required.`)
  return value
}

function endpoint(accountId: string) {
  const configured = process.env.R2_ENDPOINT?.trim()
  const value = configured || `https://${accountId}.r2.cloudflarestorage.com`
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new StorageConfigurationError('R2_ENDPOINT must be a valid HTTPS URL.')
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash || parsed.search) {
    throw new StorageConfigurationError('R2_ENDPOINT must be a credential-free HTTPS origin.')
  }
  return parsed.origin
}

export function getR2Configuration(): R2Configuration {
  const accountId = required('CLOUDFLARE_ACCOUNT_ID')
  return {
    accountId,
    accessKeyId: required('R2_ACCESS_KEY_ID'),
    secretAccessKey: required('R2_SECRET_ACCESS_KEY'),
    bucket: required('R2_BUCKET_NAME'),
    endpoint: endpoint(accountId),
  }
}

let client: S3Client | undefined
let clientSignature = ''

export function getR2Client() {
  const config = getR2Configuration()
  const signature = `${config.endpoint}\0${config.accessKeyId}\0${config.bucket}`
  if (!client || clientSignature !== signature) {
    client?.destroy()
    client = new S3Client({
      region: 'auto',
      endpoint: config.endpoint,
      // The file body is not available while a browser upload URL is signed.
      // Avoid the SDK defaulting to the CRC32 of an empty body, which makes R2
      // reject every non-empty photo uploaded with that presigned URL.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    })
    clientSignature = signature
  }
  return { client, bucket: config.bucket }
}

export function isR2Configured() {
  try {
    getR2Configuration()
    return true
  } catch {
    return false
  }
}
