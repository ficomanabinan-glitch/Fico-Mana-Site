import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

type DownloadEntry = { name: string; storageKey?: string; data?: Buffer }
type DownloadKind = 'PORTAL_ORIGINALS' | 'PORTAL_DELIVERABLES' | 'EDITOR_BATCH'

function safeFileName(value: string) {
  return value.replace(/["\r\n]/g, '').slice(0, 180) || 'FICO-MANA-PHOTOS.zip'
}

function cleanEntries(entries: DownloadEntry[]) {
  let inlineBytes = 0
  const cleaned = entries.map((entry) => {
    const name = entry.name.replace(/^[\\/]+|\.\.(?:[\\/]|$)/g, '').slice(0, 240)
    const storageKey = String(entry.storageKey || '').replace(/^\/+/, '').slice(0, 1024)
    const data = entry.data
    if (data) inlineBytes += data.byteLength
    return {
      name,
      ...(storageKey ? { storageKey } : {}),
      ...(data ? { inlineBase64: data.toString('base64') } : {}),
    }
  }).filter((entry) => entry.name && (entry.storageKey || 'inlineBase64' in entry))
  if (inlineBytes > 2 * 1024 * 1024) throw new Error('The batch metadata is too large to prepare safely.')
  return cleaned
}

function workerBaseUrl() {
  const value = process.env.PRIVATE_DOWNLOAD_WORKER_URL?.trim()
  if (!value) throw new Error('Private download delivery is not configured.')
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('PRIVATE_DOWNLOAD_WORKER_URL must be a credential-free HTTPS origin.')
  }
  return url.origin
}

export async function createPortalDownloadRedirect(input: {
  publicId: string
  kind: DownloadKind
  entries: DownloadEntry[]
  fileName: string
  rawAttemptId?: string
}) {
  const admin = getSupabaseAdmin()
  if (!admin) throw new Error('This service is temporarily unavailable.')
  const entries = cleanEntries(input.entries)
  if (!entries.length || entries.length > 2000) throw new Error('No downloadable photos are available.')
  const { data: portal, error: portalError } = await admin
    .from('client_portals')
    .select('id,workspace_id,public_id,bookings!inner(workspace_id),workspaces!inner(slug,status)')
    .eq('public_id', input.publicId)
    .eq('workspaces.slug', 'fico-mana')
    .eq('workspaces.status', 'active')
    .maybeSingle()
  if (portalError || !portal) throw new Error('Portal not found.')
  const token = randomBytes(32).toString('base64url')
  const tokenHash = createHash('sha256').update(token).digest('hex')
  const { data: manifest, error } = await admin.from('private_download_manifests').insert({
    workspace_id: portal.workspace_id,
    portal_id: portal.id,
    raw_attempt_id: input.rawAttemptId || null,
    kind: input.kind,
    token_hash: tokenHash,
    file_name: safeFileName(input.fileName),
    entries,
  }).select('id').single()
  if (error || !manifest) throw new Error(error?.message || 'The download could not be prepared.')
  return `${workerBaseUrl()}/download/${encodeURIComponent(String(manifest.id))}?token=${encodeURIComponent(token)}`
}

export async function createEditorBatchDownloadRedirect(input: {
  workspaceId: string
  actorId: string
  entries: DownloadEntry[]
  fileName: string
  batches: Array<{
    batchId: string
    jobs: Array<Record<string, unknown>>
  }>
}) {
  const admin = getSupabaseAdmin()
  if (!admin) throw new Error('This service is temporarily unavailable.')
  const entries = cleanEntries(input.entries)
  if (!entries.length || entries.length > 9000) throw new Error('No downloadable selected photos are available.')
  const completionPayload = {
    actorId: input.actorId,
    batches: input.batches.map(({ batchId, jobs }) => ({
      batchId,
      jobIds: jobs.map((job) => String(job.id)),
      bookingIds: jobs.map((job) => String(job.booking_id)),
      selectedPhotos: jobs.reduce((sum, job) => sum + Number(job.selected_count || 0), 0),
    })),
  }
  const token = randomBytes(32).toString('base64url')
  const tokenHash = createHash('sha256').update(token).digest('hex')
  const { data: manifest, error } = await admin.from('private_download_manifests').insert({
    workspace_id: input.workspaceId,
    kind: 'EDITOR_BATCH',
    token_hash: tokenHash,
    file_name: safeFileName(input.fileName),
    entries,
    completion_payload: completionPayload,
  }).select('id').single()
  if (error || !manifest) throw new Error(error?.message || 'The batch download could not be prepared.')
  return `${workerBaseUrl()}/download/${encodeURIComponent(String(manifest.id))}?token=${encodeURIComponent(token)}`
}
