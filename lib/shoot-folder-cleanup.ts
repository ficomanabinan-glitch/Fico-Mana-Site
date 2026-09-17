import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

export const FOLDER_CLEANUP_CONFIRMATION = 'DELETE SHOOT FOLDERS'

const folderGrantSchema = z.object({
  version: z.literal(2), kind: z.literal('shoot_namespace'), workspaceId: z.string().uuid(),
  actorId: z.string().uuid(), bookingId: z.string().min(1).max(160),
  storagePrefix: z.string().min(20).max(900).regex(/^workspaces\/[A-Za-z0-9_-]+\/shoots\/\d{4}\/\d{2}\/\d{2}\/[A-Za-z0-9_-]+\/$/),
  shootDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), expiresAt: z.number().int(),
  treeFingerprint: z.string().regex(/^[a-f0-9]{64}$/), fileCount: z.number().int().min(0).max(20_000),
}).strict()
export type CleanupFolderGrant = z.infer<typeof folderGrantSchema>

function signature(encoded: string) {
  const secret = process.env.SECURITY_HASH_SECRET?.trim() || ''
  if (secret.length < 32) throw new Error('Storage cleanup signing is not configured.')
  return createHmac('sha256', secret).update(`shoot-folder-cleanup:v2:${encoded}`).digest('base64url')
}

export function signCleanupFolderGrant(input: CleanupFolderGrant) {
  const grant = folderGrantSchema.parse(input)
  const expectedStart = `workspaces/${grant.workspaceId}/shoots/`
  if (!grant.storagePrefix.startsWith(expectedStart) || !grant.storagePrefix.includes(`/${grant.bookingId}/`)) {
    throw new Error('Invalid shoot namespace target.')
  }
  const encoded = Buffer.from(JSON.stringify(grant)).toString('base64url')
  return `${encoded}.${signature(encoded)}`
}

export function verifyCleanupFolderGrant(token: string, workspaceId: string, actorId: string, now = Date.now()) {
  if (token.length > 8_000) throw new Error('Invalid storage review.')
  const [encoded, actual, extra] = token.split('.')
  if (!encoded || !actual || extra) throw new Error('Invalid storage review.')
  const left = Buffer.from(actual), right = Buffer.from(signature(encoded))
  if (left.length !== right.length || !timingSafeEqual(left, right)) throw new Error('Invalid storage review.')
  const grant = folderGrantSchema.parse(JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')))
  if (grant.workspaceId !== workspaceId || grant.actorId !== actorId || grant.expiresAt <= now) {
    throw new Error('This review expired or belongs to another session.')
  }
  return grant
}

export async function runCleanupFolder(grant: CleanupFolderGrant, dependencies: {
  validate: () => Promise<void>
  auditStart: () => Promise<void>
  disablePortal: () => Promise<void>
  remove: () => Promise<void>
  auditResult: (results: Array<{ id: string; name: string; status: 'deleted' | 'failed'; error?: string }>) => Promise<void>
}) {
  await dependencies.validate()
  await dependencies.auditStart()
  await dependencies.disablePortal()
  let result: { id: string; name: string; status: 'deleted' | 'failed'; error?: string } = {
    id: grant.storagePrefix, name: grant.bookingId, status: 'deleted',
  }
  try { await dependencies.remove() }
  catch { result = { ...result, status: 'failed', error: 'Shoot deletion was not confirmed. Review the shoot again.' } }
  await dependencies.auditResult([result])
  return [result]
}
