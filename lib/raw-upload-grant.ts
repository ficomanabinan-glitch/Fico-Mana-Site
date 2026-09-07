import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { RawUploadError, rawUploadMetadataSchema } from '@/lib/raw-upload-contract'

const id = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/)
const schema = rawUploadMetadataSchema.extend({
  version: z.literal(1), workspaceId: z.string().uuid(), actorId: z.string().uuid(), bookingId: id,
  rawFolderId: id, incomingFolderId: id, uploadKey: z.string().regex(/^[a-f0-9]{64}$/), expiresAt: z.number().int(),
  generation: z.number().int().nonnegative().optional(),
}).strict()
export type RawUploadGrant = z.infer<typeof schema>

function secret() {
  const value = process.env.SECURITY_HASH_SECRET?.trim() || ''
  if (value.length < 32) throw new RawUploadError('Secure uploads are not configured. Try: ask the administrator to check the upload service.', 503)
  return value
}

export function signRawUploadGrant(grant: RawUploadGrant) {
  const payload = Buffer.from(JSON.stringify(schema.parse(grant))).toString('base64url')
  const signature = createHmac('sha256', secret()).update(`onsite-raw-upload:v1:${payload}`).digest('base64url')
  return `${payload}.${signature}`
}

export function verifyRawUploadGrant(token: string, workspaceId: string, actorId: string, bookingId: string, now = Date.now()) {
  const invalid = () => new RawUploadError('This upload permission expired or belongs to another session. Try: refresh the page and select the file again.', 403)
  if (token.length > 6000) throw invalid()
  const [payload, signature, extra] = token.split('.')
  if (!payload || !signature || extra) throw invalid()
  const expected = createHmac('sha256', secret()).update(`onsite-raw-upload:v1:${payload}`).digest('base64url')
  const left = Buffer.from(signature), right = Buffer.from(expected)
  if (left.length !== right.length || !timingSafeEqual(left, right)) throw invalid()
  let grant: RawUploadGrant
  try { grant = schema.parse(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))) } catch { throw invalid() }
  if (grant.workspaceId !== workspaceId || grant.actorId !== actorId || grant.bookingId !== bookingId ||
    grant.expiresAt <= now || grant.expiresAt > now + 65 * 60 * 1000) throw invalid()
  return grant
}
