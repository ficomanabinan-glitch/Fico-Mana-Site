import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { evaluateR2Claim, reconcileR2Claims, type R2ObjectClaim } from '../lib/storage/r2-reconciliation.ts'

const sha = 'a'.repeat(64)
const claim: R2ObjectClaim = {
  source: 'gallery_files',
  rowId: 'row-1',
  workspaceId: '11111111-1111-4111-8111-111111111111',
  bookingId: 'FM-001',
  storageKey: 'workspaces/11111111-1111-4111-8111-111111111111/shoots/2026/09/2026-09-15/FM-001/original/object.jpg',
  expectedSize: 123,
  expectedSha256: sha,
}

test('reconciliation compares Content-Length and R2 sha256 metadata without object bytes', () => {
  assert.equal(evaluateR2Claim(claim, {
    contentLength: 123,
    sha256: sha.toUpperCase(),
    etag: 'etag',
    lastModified: '2026-09-15T00:00:00.000Z',
  }).status, 'verified')

  assert.equal(evaluateR2Claim(claim, {
    contentLength: 122,
    sha256: sha,
    etag: null,
    lastModified: null,
  }).status, 'size_mismatch')

  assert.equal(evaluateR2Claim(claim, {
    contentLength: 123,
    sha256: 'b'.repeat(64),
    etag: null,
    lastModified: null,
  }).status, 'checksum_mismatch')

  assert.equal(evaluateR2Claim({ ...claim, expectedSize: null, expectedSha256: null }, {
    contentLength: 123,
    sha256: null,
    etag: null,
    lastModified: null,
  }).status, 'metadata_incomplete')
})

test('reconciliation deduplicates HeadObject requests and reports missing objects', async () => {
  let calls = 0
  const missing = Object.assign(new Error('missing'), { name: 'NotFound', $metadata: { httpStatusCode: 404 } })
  const report = await reconcileR2Claims({
    claims: [claim, { ...claim, rowId: 'row-2' }, { ...claim, rowId: 'row-3', storageKey: `${claim.storageKey}.missing` }],
    concurrency: 3,
    checkedAt: '2026-09-15T00:00:00.000Z',
    headObject: async (key) => {
      calls += 1
      if (key.endsWith('.missing')) throw missing
      return { contentLength: 123, sha256: sha, etag: null, lastModified: null }
    },
  })

  assert.equal(calls, 2)
  assert.equal(report.uniqueObjectCount, 2)
  assert.equal(report.summary.verified, 2)
  assert.equal(report.summary.missing, 1)
  assert.equal(report.verified, false)
})

test('invalid namespace claims fail before any R2 request', async () => {
  let calls = 0
  const report = await reconcileR2Claims({
    claims: [{ ...claim, storageKey: 'foreign/object.jpg' }],
    validateClaim: () => { throw new Error('outside namespace') },
    headObject: async () => {
      calls += 1
      return { contentLength: 123, sha256: sha, etag: null, lastModified: null }
    },
  })
  assert.equal(calls, 0)
  assert.equal(report.summary.invalid_claim, 1)
})

test('CLI source is structurally read-only for both R2 and Supabase', () => {
  const source = readFileSync('scripts/reconcile-r2.mjs', 'utf8')
  assert.match(source, /HeadObjectCommand/)
  assert.doesNotMatch(source, /(?:Get|Put|Copy|Delete|List|CreateMultipart|CompleteMultipart|AbortMultipart)Object(?:s)?Command/)
  assert.doesNotMatch(source, /\.\s*(?:insert|upsert|update|delete)\s*\(/)
  assert.doesNotMatch(source, /\.rpc\s*\(/)
})
