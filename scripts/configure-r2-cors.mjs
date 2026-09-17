import { PutBucketCorsCommand, S3Client } from '@aws-sdk/client-s3'

const required = (name) => {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required.`)
  return value
}

const accountId = required('CLOUDFLARE_ACCOUNT_ID')
const bucket = required('R2_BUCKET_NAME')
const endpoint = process.env.R2_ENDPOINT?.trim() || `https://${accountId}.r2.cloudflarestorage.com`

const client = new S3Client({
  region: 'auto',
  endpoint,
  credentials: {
    accessKeyId: required('R2_ACCESS_KEY_ID'),
    secretAccessKey: required('R2_SECRET_ACCESS_KEY'),
  },
})

await client.send(new PutBucketCorsCommand({
  Bucket: bucket,
  CORSConfiguration: {
    CORSRules: [{
      AllowedOrigins: [
        'https://ficomana.com',
        'https://www.ficomana.com',
        'https://admin.ficomana.com',
        'https://editor.ficomana.com',
      ],
      AllowedMethods: ['GET', 'HEAD', 'PUT'],
      AllowedHeaders: [
        'content-type',
        'x-amz-meta-bookingid',
        'x-amz-meta-uploadkey',
        'x-amz-meta-generation',
        'x-amz-meta-relativepath',
        'x-amz-meta-filename',
        'x-amz-meta-sha256',
      ],
      ExposeHeaders: ['etag', 'content-length'],
      MaxAgeSeconds: 3600,
    }],
  },
}))

console.log(`Applied the FICO MANA browser-upload CORS policy to R2 bucket ${bucket}.`)
