import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

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

const driveId = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/)
export const cleanupFileSchema = z.object({
  id: driveId, name: z.string().max(1000), category: z.enum(cleanupCategories),
  // Direct parent first, ending at the configured root. Never follow shortcuts.
  parents: z.array(driveId).min(5).max(12),
  fingerprint: z.string().max(500),
}).strict()
export type CleanupFile = z.infer<typeof cleanupFileSchema>
const grantSchema = z.object({
  version: z.literal(1), workspaceId: z.string().uuid(), actorId: z.string().uuid(),
  bookingId: z.string().min(1).max(160), rootId: driveId,
  shootDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  files: z.array(cleanupFileSchema).min(1).max(CLEANUP_CHUNK_SIZE), expiresAt: z.number().int(),
}).strict()
export type CleanupGrant = z.infer<typeof grantSchema>

function signingKey() {
  const secret = process.env.SECURITY_HASH_SECRET?.trim() || ''
  if (secret.length < 32) throw new Error('Storage cleanup signing is not configured.')
  return secret
}

export function signCleanupGrant(grant: CleanupGrant) {
  const encoded = Buffer.from(JSON.stringify(grantSchema.parse(grant))).toString('base64url')
  const signature = createHmac('sha256', signingKey()).update(`shoot-cleanup:v1:${encoded}`).digest('base64url')
  return `${encoded}.${signature}`
}

export function verifyCleanupGrant(token: string, workspaceId: string, actorId: string, now = Date.now()) {
  if (token.length > 40_000) throw new Error('Invalid cleanup review.')
  const [encoded, signature, extra] = token.split('.')
  if (!encoded || !signature || extra) throw new Error('Invalid cleanup review.')
  const expected = createHmac('sha256', signingKey()).update(`shoot-cleanup:v1:${encoded}`).digest('base64url')
  const left = Buffer.from(signature), right = Buffer.from(expected)
  if (left.length !== right.length || !timingSafeEqual(left, right)) throw new Error('Invalid cleanup review.')
  const grant = grantSchema.parse(JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')))
  if (grant.workspaceId !== workspaceId || grant.actorId !== actorId || grant.expiresAt <= now) {
    throw new Error('This review expired or belongs to another session.')
  }
  if (new Set(grant.files.map(file => file.id)).size !== grant.files.length
    || grant.files.some(file => file.id === grant.rootId || file.parents.at(-1) !== grant.rootId)) {
    throw new Error('Invalid cleanup targets.')
  }
  return grant
}

export function cleanupFingerprint(file: { mimeType: string; size?: string; md5Checksum?: string; modifiedTime?: string }) {
  return [file.mimeType, file.size || '', file.md5Checksum || '', file.modifiedTime || ''].join('|')
}

export function validateCleanupFile(file: CleanupFile, current: {
  id: string; name: string; mimeType: string; parents?: string[]; trashed?: boolean;
  size?: string; md5Checksum?: string; modifiedTime?: string;
}): 'present' | 'trashed' {
  if (current.id !== file.id || current.mimeType === 'application/vnd.google-apps.folder'
    || current.mimeType === 'application/vnd.google-apps.shortcut' || current.parents?.length !== 1
    || current.parents[0] !== file.parents[0]) throw new Error('File location changed. Review again.')
  if (current.trashed) return 'trashed'
  if (cleanupFingerprint(current) !== file.fingerprint || current.name !== file.name) throw new Error('File changed since review. Review again.')
  return 'present'
}

export type CleanupOutcome = { id: string; name: string; status: 'trashed' | 'already_trashed' | 'failed'; error?: string }

/** Dependency-injected runner: production and tests use the same fail-closed ordering. */
export async function runCleanupChunk(grant: CleanupGrant, dependencies: {
  validate: (file: CleanupFile) => Promise<'present' | 'trashed'>
  auditStart: () => Promise<void>
  disablePortal: () => Promise<void>
  trash: (file: CleanupFile) => Promise<void>
  auditResult: (results: CleanupOutcome[]) => Promise<void>
}) {
  // No writes until every target in this chunk passes current ownership/path/content checks.
  const states = []
  for (const file of grant.files) states.push(await dependencies.validate(file))
  await dependencies.auditStart()
  await dependencies.disablePortal()
  const results: CleanupOutcome[] = []
  for (const [index, file] of grant.files.entries()) {
    try {
      if (states[index] !== 'trashed') await dependencies.trash(file)
      results.push({ id: file.id, name: file.name, status: states[index] === 'trashed' ? 'already_trashed' : 'trashed' })
    } catch {
      results.push({ id: file.id, name: file.name, status: 'failed',
        error: 'File was not confirmed in Trash. Try: check Drive access, then review again.' })
    }
  }
  await dependencies.auditResult(results)
  return results
}
