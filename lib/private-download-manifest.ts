import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

type DownloadEntry = { name: string; storageKey?: string }
type DownloadKind = 'PORTAL_ORIGINALS' | 'PORTAL_DELIVERABLES'

function safeFileName(value: string) {
  return value.replace(/["\r\n]/g, '').slice(0, 180) || 'FICO-MANA-PHOTOS.zip'
}

function cleanEntries(entries: DownloadEntry[]) {
  return entries.map((entry) => ({
    name: entry.name.replace(/^[\\/]+|\.\.(?:[\\/]|$)/g, '').slice(0, 240),
    storageKey: String(entry.storageKey || '').replace(/^\/+/, '').slice(0, 1024),
  })).filter((entry) => entry.name && entry.storageKey)
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
