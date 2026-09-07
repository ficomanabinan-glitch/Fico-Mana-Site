import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { cleanupFingerprint, type CleanupOutcome } from './shoot-storage-cleanup'

export const FOLDER_CLEANUP_CONFIRMATION = 'DELETE SHOOT FOLDERS'
export const DRIVE_FOLDER_TYPE = 'application/vnd.google-apps.folder'
export const DRIVE_SHORTCUT_TYPE = 'application/vnd.google-apps.shortcut'
const driveId = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/)
const folderGrantSchema = z.object({
  version: z.literal(1), kind: z.literal('shoot_folder'),
  workspaceId: z.string().uuid(), actorId: z.string().uuid(), bookingId: z.string().min(1).max(160),
  rootId: driveId, shootDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), expiresAt: z.number().int(),
  folder: z.object({
    id: driveId, name: z.string().max(1000), parents: z.tuple([driveId, driveId, driveId]),
    fingerprint: z.string().max(500),
  }).strict(),
  treeFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  fileCount: z.number().int().min(0).max(5000), subfolderCount: z.number().int().min(0).max(199),
  shortcutCount: z.number().int().min(0).max(5000),
}).strict()
export type CleanupFolderGrant = z.infer<typeof folderGrantSchema>
export type FolderEntry = {
  id: string; name: string; mimeType: string; parents?: string[]; trashed?: boolean
  size?: string; md5Checksum?: string; modifiedTime?: string; capabilities?: { canTrash?: boolean }
}

function signature(encoded: string) {
  const secret = process.env.SECURITY_HASH_SECRET?.trim() || ''
  if (secret.length < 32) throw new Error('Storage cleanup signing is not configured.')
  return createHmac('sha256', secret).update(`shoot-folder-cleanup:v1:${encoded}`).digest('base64url')
}

export function signCleanupFolderGrant(input: CleanupFolderGrant) {
  const grant = folderGrantSchema.parse(input)
  if (grant.folder.parents.at(-1) !== grant.rootId || new Set([grant.folder.id, ...grant.folder.parents]).size !== 4) {
    throw new Error('Invalid shoot folder target.')
  }
  const encoded = Buffer.from(JSON.stringify(grant)).toString('base64url')
  return `${encoded}.${signature(encoded)}`
}

export function verifyCleanupFolderGrant(token: string, workspaceId: string, actorId: string, now = Date.now()) {
  if (token.length > 6000) throw new Error('Invalid folder review.')
  const [encoded, actual, extra] = token.split('.')
  if (!encoded || !actual || extra) throw new Error('Invalid folder review.')
  const left = Buffer.from(actual), right = Buffer.from(signature(encoded))
  if (left.length !== right.length || !timingSafeEqual(left, right)) throw new Error('Invalid folder review.')
  const grant = folderGrantSchema.parse(JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')))
  if (grant.workspaceId !== workspaceId || grant.actorId !== actorId || grant.expiresAt <= now) {
    throw new Error('This folder review expired or belongs to another session.')
  }
  if (grant.folder.parents.at(-1) !== grant.rootId || new Set([grant.folder.id, ...grant.folder.parents]).size !== 4) {
    throw new Error('Invalid shoot folder target.')
  }
  return grant
}

export function folderTreeFingerprint(entries: FolderEntry[]) {
  const rows = entries.map(file => [file.id, file.name, file.mimeType, file.parents?.[0] || '', cleanupFingerprint(file)])
    .sort((a, b) => a[0].localeCompare(b[0], 'en'))
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex')
}

export function validateCleanupFolder(grant: CleanupFolderGrant, current: FolderEntry): 'present' | 'trashed' {
  if (current.id !== grant.folder.id || current.mimeType !== DRIVE_FOLDER_TYPE || current.parents?.length !== 1
    || current.parents[0] !== grant.folder.parents[0]) throw new Error('Shoot folder moved. Review again.')
  if (current.trashed) return 'trashed'
  if (current.name !== grant.folder.name || cleanupFingerprint(current) !== grant.folder.fingerprint) {
    throw new Error('Shoot folder changed. Review again.')
  }
  if (current.capabilities?.canTrash !== true) throw new Error('Drive does not allow this folder to be moved to Trash.')
  return 'present'
}

/** The single mutation targets the registered client folder, never its parent or shortcut targets. */
export async function runCleanupFolder(grant: CleanupFolderGrant, dependencies: {
  validate: () => Promise<'present' | 'trashed'>
  auditStart: () => Promise<void>
  disablePortal: () => Promise<void>
  trash: () => Promise<void>
  auditResult: (results: CleanupOutcome[]) => Promise<void>
}) {
  const state = await dependencies.validate()
  await dependencies.auditStart()
  await dependencies.disablePortal()
  let result: CleanupOutcome = { id: grant.folder.id, name: grant.folder.name, status: state === 'trashed' ? 'already_trashed' : 'trashed' }
  try { if (state !== 'trashed') await dependencies.trash() }
  catch { result = { ...result, status: 'failed', error: 'Folder was not confirmed in Trash. Try: check Drive access and review again. The portal may already be disabled.' } }
  await dependencies.auditResult([result])
  return [result]
}
