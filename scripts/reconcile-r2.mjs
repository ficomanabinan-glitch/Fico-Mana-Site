import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { createClient } from '@supabase/supabase-js'
import { config as loadEnvironment } from 'dotenv'
import { reconcileR2Claims } from '../lib/storage/r2-reconciliation.ts'
import { assertStorageKeyOwnership } from '../lib/storage/storage-keys.ts'

loadEnvironment({ path: ['.env.local', '.env'], quiet: true })

const PAGE_SIZE = 1_000

function usage() {
  console.log(`Read-only Supabase-to-R2 object reconciliation

Usage: pnpm storage:reconcile [options]

Options:
  --workspace <uuid>   Limit claims to one workspace
  --concurrency <1-50> Concurrent R2 HeadObject requests (default: 10)
  --output <path>      JSON report path (default: artifacts/r2-reconciliation-<time>.json)
  --help               Show this help

The command reads Supabase rows and sends R2 HeadObject requests only. It never
downloads object bodies, lists the bucket, changes database rows, or mutates R2.`)
}

function parseArgs(values) {
  const options = { workspace: null, concurrency: 10, output: null }
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === '--help') return { ...options, help: true }
    if (!['--workspace', '--concurrency', '--output'].includes(value)) throw new Error(`Unknown option: ${value}`)
    const next = values[++index]
    if (!next || next.startsWith('--')) throw new Error(`${value} requires a value.`)
    if (value === '--workspace') options.workspace = next
    if (value === '--output') options.output = next
    if (value === '--concurrency') options.concurrency = Number(next)
  }
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 50) {
    throw new Error('--concurrency must be an integer from 1 to 50.')
  }
  if (options.workspace && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(options.workspace)) {
    throw new Error('--workspace must be a UUID.')
  }
  return options
}

function required(name, alternatives = []) {
  for (const candidate of [name, ...alternatives]) {
    const value = process.env[candidate]?.trim()
    if (value) return value
  }
  throw new Error(`${[name, ...alternatives].join(' or ')} is required.`)
}

function r2Endpoint(accountId) {
  const value = process.env.R2_ENDPOINT?.trim() || `https://${accountId}.r2.cloudflarestorage.com`
  const parsed = new URL(value)
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('R2_ENDPOINT must be a credential-free HTTPS origin.')
  }
  return parsed.origin
}

async function readAll(buildQuery) {
  const rows = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`Supabase reconciliation query failed: ${error.message}`)
    rows.push(...(data || []))
    if (!data || data.length < PAGE_SIZE) return rows
  }
}

function scope(query, workspace) {
  return workspace ? query.eq('workspace_id', workspace) : query
}

function baseClaim(source, row, storageKey, expectedSize, expectedSha256) {
  return {
    source,
    rowId: String(row.id || ''),
    workspaceId: String(row.workspace_id || ''),
    bookingId: String(row.booking_id || ''),
    storageKey: String(storageKey || ''),
    expectedSize: expectedSize === null || expectedSize === undefined ? null : Number(expectedSize),
    expectedSha256: expectedSha256 === null || expectedSha256 === undefined ? null : String(expectedSha256),
  }
}

async function loadClaims(admin, workspace) {
  const [gallery, deliverables, prints] = await Promise.all([
    readAll((from, to) => scope(admin.from('gallery_files')
      .select('id,workspace_id,booking_id,storage_key,file_size,checksum,preview_reference,thumbnail_reference')
      .eq('storage_provider', 'r2').eq('storage_status', 'available'), workspace).range(from, to)),
    readAll((from, to) => scope(admin.from('deliverable_files')
      .select('id,workspace_id,booking_id,storage_key,file_size,checksum')
      .eq('storage_provider', 'r2').eq('storage_status', 'available'), workspace).range(from, to)),
    readAll((from, to) => scope(admin.from('print_allocations')
      .select('id,workspace_id,booking_id,print_storage_key,enhanced_storage_key')
      .eq('storage_provider', 'r2').eq('storage_status', 'available'), workspace).range(from, to)),
  ])

  return [
    ...gallery.flatMap((row) => [
      baseClaim('gallery_files', row, row.storage_key, row.file_size, row.checksum),
      ...(row.preview_reference ? [baseClaim('gallery_preview', row, row.preview_reference, null, null)] : []),
      ...(row.thumbnail_reference ? [baseClaim('gallery_thumbnail', row, row.thumbnail_reference, null, null)] : []),
    ]),
    ...deliverables.map((row) => baseClaim('deliverable_files', row, row.storage_key, row.file_size, row.checksum)),
    ...prints.flatMap((row) => [
      baseClaim('print_allocations', row, row.print_storage_key, null, null),
      baseClaim('print_allocations', row, row.enhanced_storage_key, null, null),
    ]),
  ]
}

function timestampName() {
  return new Date().toISOString().replaceAll(':', '-').replace(/\.\d{3}Z$/, 'Z')
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) return usage()

  const supabaseUrl = required('NEXT_PUBLIC_SUPABASE_URL')
  const supabaseSecret = required('SUPABASE_SECRET_KEY', ['SUPABASE_SERVICE_ROLE_KEY'])
  const accountId = required('CLOUDFLARE_ACCOUNT_ID')
  const bucket = required('R2_BUCKET_NAME')
  const r2 = new S3Client({
    region: 'auto',
    endpoint: r2Endpoint(accountId),
    credentials: {
      accessKeyId: required('R2_ACCESS_KEY_ID'),
      secretAccessKey: required('R2_SECRET_ACCESS_KEY'),
    },
  })
  const admin = createClient(supabaseUrl, supabaseSecret, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  try {
    const claims = await loadClaims(admin, options.workspace)
    const report = await reconcileR2Claims({
      claims,
      concurrency: options.concurrency,
      validateClaim: (claim) => assertStorageKeyOwnership(claim.storageKey, claim.workspaceId, claim.bookingId),
      headObject: async (storageKey) => {
        const response = await r2.send(new HeadObjectCommand({ Bucket: bucket, Key: storageKey }))
        return {
          contentLength: response.ContentLength === undefined ? null : Number(response.ContentLength),
          sha256: response.Metadata?.sha256 || null,
          etag: response.ETag?.replace(/^"|"$/g, '') || null,
          lastModified: response.LastModified?.toISOString() || null,
        }
      },
    })

    const output = resolve(options.output || `artifacts/r2-reconciliation-${timestampName()}.json`)
    await mkdir(dirname(output), { recursive: true })
    await writeFile(output, `${JSON.stringify({
      target: { supabaseHost: new URL(supabaseUrl).host, bucket, workspace: options.workspace },
      ...report,
    }, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })

    console.log(`R2 reconciliation report: ${output}`)
    console.log(`Claims: ${report.claimCount}; unique HeadObject requests: ${report.uniqueObjectCount}`)
    console.log(Object.entries(report.summary).map(([status, count]) => `${status}=${count}`).join('; '))
    if (!report.verified) process.exitCode = 2
  } finally {
    r2.destroy()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'R2 reconciliation failed.')
  process.exitCode = 1
})
