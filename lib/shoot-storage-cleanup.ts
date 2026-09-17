import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { assertStorageKeyOwnership } from '@/lib/storage/storage-keys'

export const cleanupCategories = ['RAW', 'SELECTED', 'EDITED', 'DELIVERABLES'] as const
export const cleanupRangeSchema = z.enum(['7days', 'month', 'all'])
export const cleanupCategoriesSchema = z.array(z.enum(cleanupCategories)).min(1).max(4)
  .refine(values => new Set(values).size === values.length)
export type CleanupCategory = typeof cleanupCategories[number]
export type CleanupRange = z.infer<typeof cleanupRangeSchema>
export const CLEANUP_CONFIRMATION = 'DELETE SHOOT FILES'
export const CLEANUP_CHUNK_SIZE = 10

/** Inclusive scheduled dates in GMT+8; a month means the last 30 calendar days. */
export function cleanupDateRange(range: CleanupRange, now = new Date()) {
  if (range === 'all') return { from: null, to: null }
  const today = new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const start = new Date(`${today}T00:00:00Z`)
  start.setUTCDate(start.getUTCDate() - (range === '7days' ? 6 : 29))
  return { from: start.toISOString().slice(0, 10), to: today }
}

const storageKey = z.string().trim().min(20).max(1_024)
const cleanupFileSchema = z.object({
  id: storageKey,
  storageKey,
  name: z.string().max(1_000),
  category: z.enum(cleanupCategories),
  fingerprint: z.string().max(1_000),
}).strict()
export type CleanupFile = z.infer<typeof cleanupFileSchema>

const grantSchema = z.object({
  version: z.literal(2), workspaceId: z.string().uuid(), actorId: z.string().uuid(),
  bookingId: z.string().min(1).max(160), shootDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  files: z.array(cleanupFileSchema).min(1).max(CLEANUP_CHUNK_SIZE), expiresAt: z.number().int(),
}).strict()
export type CleanupGrant = z.infer<typeof grantSchema>

function signingKey() {
  const secret = process.env.SECURITY_HASH_SECRET?.trim() || ''
  if (secret.length < 32) throw new Error('Storage cleanup signing is not configured.')
  return secret
}

export function signCleanupGrant(grant: CleanupGrant) {
  const parsed = grantSchema.parse(grant)
  for (const file of parsed.files) assertStorageKeyOwnership(file.storageKey, parsed.workspaceId, parsed.bookingId)
  const encoded = Buffer.from(JSON.stringify(parsed)).toString('base64url')
  const signature = createHmac('sha256', signingKey()).update(`shoot-cleanup:v2:${encoded}`).digest('base64url')
  return `${encoded}.${signature}`
}

export function verifyCleanupGrant(token: string, workspaceId: string, actorId: string, now = Date.now()) {
  if (token.length > 60_000) throw new Error('Invalid cleanup review.')
  const [encoded, signature, extra] = token.split('.')
  if (!encoded || !signature || extra) throw new Error('Invalid cleanup review.')
  const expected = createHmac('sha256', signingKey()).update(`shoot-cleanup:v2:${encoded}`).digest('base64url')
  const left = Buffer.from(signature), right = Buffer.from(expected)
  if (left.length !== right.length || !timingSafeEqual(left, right)) throw new Error('Invalid cleanup review.')
  const grant = grantSchema.parse(JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')))
  if (grant.workspaceId !== workspaceId || grant.actorId !== actorId || grant.expiresAt <= now) {
    throw new Error('This review expired or belongs to another session.')
  }
  if (new Set(grant.files.map(file => file.storageKey)).size !== grant.files.length) throw new Error('Invalid cleanup targets.')
  for (const file of grant.files) assertStorageKeyOwnership(file.storageKey, workspaceId, grant.bookingId)
  return grant
}

export function cleanupFingerprint(file: { contentType?: string; size?: number; etag?: string | null; lastModified?: Date | string | null }) {
  const modified = file.lastModified instanceof Date ? file.lastModified.toISOString() : file.lastModified || ''
  return [file.contentType || '', String(file.size ?? ''), file.etag || '', modified].join('|')
}

export function validateCleanupFile(file: CleanupFile, current: {
  key: string; contentType?: string; size?: number; etag?: string | null; lastModified?: Date | string | null
} | null): 'present' | 'deleted' {
  if (!current) return 'deleted'
  if (current.key !== file.storageKey || cleanupFingerprint(current) !== file.fingerprint) {
    throw new Error('File changed since review. Review again.')
  }
  return 'present'
}

export type CleanupOutcome = { id: string; name: string; status: 'deleted' | 'already_deleted' | 'failed'; error?: string }

/** Dependency-injected runner keeps the fail-closed review and mutation order testable. */
export async function runCleanupChunk(grant: CleanupGrant, dependencies: {
  validate: (file: CleanupFile) => Promise<'present' | 'deleted'>
  auditStart: () => Promise<void>
  disablePortal: () => Promise<void>
  remove: (file: CleanupFile) => Promise<void>
  auditResult: (results: CleanupOutcome[]) => Promise<void>
}) {
  const states = []
  for (const file of grant.files) states.push(await dependencies.validate(file))
  await dependencies.auditStart()
  await dependencies.disablePortal()
  const results: CleanupOutcome[] = []
  for (const [index, file] of grant.files.entries()) {
    try {
      if (states[index] !== 'deleted') await dependencies.remove(file)
      results.push({ id: file.id, name: file.name, status: states[index] === 'deleted' ? 'already_deleted' : 'deleted' })
    } catch {
      results.push({ id: file.id, name: file.name, status: 'failed', error: 'File deletion was not confirmed. Review the shoot again.' })
    }
  }
  await dependencies.auditResult(results)
  return results
}
