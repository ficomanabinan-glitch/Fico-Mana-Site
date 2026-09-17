export type R2ObjectClaim = {
  source: 'gallery_files' | 'deliverable_files' | 'gallery_preview' | 'gallery_thumbnail' | 'print_allocations'
  rowId: string
  workspaceId: string
  bookingId: string
  storageKey: string
  expectedSize: number | null
  expectedSha256: string | null
}

export type R2HeadMetadata = {
  contentLength: number | null
  sha256: string | null
  etag: string | null
  lastModified: string | null
}

export type ReconciliationStatus =
  | 'verified'
  | 'invalid_claim'
  | 'missing'
  | 'size_mismatch'
  | 'checksum_mismatch'
  | 'metadata_incomplete'
  | 'head_error'

export type R2ReconciliationResult = R2ObjectClaim & {
  status: ReconciliationStatus
  actualSize: number | null
  actualSha256: string | null
  etag: string | null
  lastModified: string | null
  detail: string | null
}

export type R2ReconciliationReport = {
  checkedAt: string
  claimCount: number
  uniqueObjectCount: number
  summary: Record<ReconciliationStatus, number>
  verified: boolean
  results: R2ReconciliationResult[]
}

const SHA256 = /^[a-f0-9]{64}$/

function emptySummary(): Record<ReconciliationStatus, number> {
  return {
    verified: 0,
    invalid_claim: 0,
    missing: 0,
    size_mismatch: 0,
    checksum_mismatch: 0,
    metadata_incomplete: 0,
    head_error: 0,
  }
}

function normalizedSha256(value: string | null) {
  return value?.trim().toLowerCase() || null
}

function invalidClaimDetail(claim: R2ObjectClaim) {
  if (!claim.rowId || !claim.workspaceId || !claim.bookingId || !claim.storageKey) {
    return 'The database claim is missing its row, workspace, booking, or storage key.'
  }
  if (claim.expectedSize !== null && (!Number.isSafeInteger(claim.expectedSize) || claim.expectedSize <= 0)) {
    return 'The database byte size is not a positive safe integer.'
  }
  const checksum = normalizedSha256(claim.expectedSha256)
  if (claim.expectedSha256 !== null && (!checksum || !SHA256.test(checksum))) {
    return 'The database SHA-256 is not 64 hexadecimal characters.'
  }
  return null
}

function resultFor(claim: R2ObjectClaim, status: ReconciliationStatus, detail: string | null, actual: R2HeadMetadata | null = null): R2ReconciliationResult {
  return {
    ...claim,
    expectedSha256: normalizedSha256(claim.expectedSha256),
    status,
    actualSize: actual?.contentLength ?? null,
    actualSha256: normalizedSha256(actual?.sha256 ?? null),
    etag: actual?.etag ?? null,
    lastModified: actual?.lastModified ?? null,
    detail,
  }
}

function errorStatus(error: unknown): 'missing' | 'head_error' {
  const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } }
  const status = Number(candidate?.$metadata?.httpStatusCode || 0)
  return status === 404 || candidate?.name === 'NoSuchKey' || candidate?.name === 'NotFound'
    ? 'missing'
    : 'head_error'
}

function safeErrorDetail(error: unknown) {
  const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } }
  const status = Number(candidate?.$metadata?.httpStatusCode || 0)
  if (status) return `R2 HeadObject returned HTTP ${status}.`
  return candidate?.name ? `R2 HeadObject failed with ${candidate.name}.` : 'R2 HeadObject failed.'
}

export function evaluateR2Claim(claim: R2ObjectClaim, actual: R2HeadMetadata): R2ReconciliationResult {
  const invalid = invalidClaimDetail(claim)
  if (invalid) return resultFor(claim, 'invalid_claim', invalid, actual)

  if (!Number.isSafeInteger(actual.contentLength) || Number(actual.contentLength) <= 0) {
    return resultFor(claim, 'metadata_incomplete', 'R2 did not return a positive Content-Length.', actual)
  }

  const actualChecksum = normalizedSha256(actual.sha256)
  if (!actualChecksum || !SHA256.test(actualChecksum)) {
    return resultFor(claim, 'metadata_incomplete', 'R2 object metadata does not contain a valid sha256 value.', actual)
  }

  if (claim.expectedSize !== null && actual.contentLength !== claim.expectedSize) {
    return resultFor(claim, 'size_mismatch', 'R2 Content-Length differs from the database file_size.', actual)
  }

  const expectedChecksum = normalizedSha256(claim.expectedSha256)
  if (expectedChecksum !== null && actualChecksum !== expectedChecksum) {
    return resultFor(claim, 'checksum_mismatch', 'R2 sha256 metadata differs from the database checksum.', actual)
  }

  return resultFor(claim, 'verified', null, actual)
}

export async function reconcileR2Claims(input: {
  claims: R2ObjectClaim[]
  headObject: (storageKey: string) => Promise<R2HeadMetadata>
  validateClaim?: (claim: R2ObjectClaim) => void
  concurrency?: number
  checkedAt?: string
}): Promise<R2ReconciliationReport> {
  const concurrency = Math.max(1, Math.min(50, Math.floor(input.concurrency || 10)))
  const headCache = new Map<string, Promise<R2HeadMetadata>>()
  const results = new Array<R2ReconciliationResult>(input.claims.length)
  let cursor = 0

  async function worker() {
    while (cursor < input.claims.length) {
      const index = cursor++
      const claim = input.claims[index]
      const invalid = invalidClaimDetail(claim)
      if (invalid) {
        results[index] = resultFor(claim, 'invalid_claim', invalid)
        continue
      }
      try {
        input.validateClaim?.(claim)
      } catch {
        results[index] = resultFor(claim, 'invalid_claim', 'The storage key is outside the claimed workspace or booking namespace.')
        continue
      }

      let request = headCache.get(claim.storageKey)
      if (!request) {
        request = input.headObject(claim.storageKey)
        headCache.set(claim.storageKey, request)
      }

      try {
        results[index] = evaluateR2Claim(claim, await request)
      } catch (error) {
        const status = errorStatus(error)
        results[index] = resultFor(
          claim,
          status,
          status === 'missing' ? 'The claimed R2 object was not found.' : safeErrorDetail(error),
        )
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, input.claims.length)) }, () => worker()))
  const summary = emptySummary()
  for (const result of results) summary[result.status] += 1

  return {
    checkedAt: input.checkedAt || new Date().toISOString(),
    claimCount: input.claims.length,
    uniqueObjectCount: headCache.size,
    summary,
    verified: results.length > 0 && results.every((result) => result.status === 'verified'),
    results,
  }
}
