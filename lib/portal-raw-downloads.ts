import { getSupabaseAdmin } from '@/lib/supabase/admin'

export const PORTAL_RAW_DOWNLOAD_LIMIT = 2
export const PORTAL_RAW_DOWNLOAD_REASON_MIN = 5
export const PORTAL_RAW_DOWNLOAD_REASON_MAX = 500

export type PortalRawDownloadAccess = {
  allowed: boolean
  completedInWindow: number
  activeDownloads: number
  limit: number
  requestStatus: 'AVAILABLE' | 'PENDING' | 'GRANTED' | 'RESERVED'
  nextAvailableAt: string | null
}

export type PortalRawDownloadRequest = {
  id: string
  bookingId: string
  customerName: string
  packageName: string
  shootDate: string
  reason: string
  requestedAt: string
}

function adminClient() {
  const admin = getSupabaseAdmin()
  if (!admin) throw new Error('This service is temporarily unavailable.')
  return admin
}

async function portalScope(publicId: string) {
  const admin = adminClient()
  const { data, error } = await admin
    .from('client_portals')
    .select('workspace_id,public_id,bookings!inner(workspace_id),workspaces!inner(slug,status)')
    .eq('public_id', publicId)
    .eq('workspaces.slug', 'fico-mana')
    .eq('workspaces.status', 'active')
    .maybeSingle()
  if (error || !data) throw new Error('Portal not found.')
  const booking = Array.isArray(data.bookings) ? data.bookings[0] : data.bookings
  if (booking?.workspace_id !== data.workspace_id) throw new Error('Portal not found.')
  return { admin, workspaceId: String(data.workspace_id), publicId: String(data.public_id) }
}

function normalizeAccess(value: unknown): PortalRawDownloadAccess {
  const row = (value || {}) as Record<string, unknown>
  const requestStatus = String(row.requestStatus || 'AVAILABLE')
  return {
    allowed: Boolean(row.allowed),
    completedInWindow: Math.max(0, Number(row.completedInWindow || 0)),
    activeDownloads: Math.max(0, Number(row.activeDownloads || 0)),
    limit: Number(row.limit || PORTAL_RAW_DOWNLOAD_LIMIT),
    requestStatus: ['PENDING', 'GRANTED', 'RESERVED'].includes(requestStatus)
      ? requestStatus as PortalRawDownloadAccess['requestStatus']
      : 'AVAILABLE',
    nextAvailableAt: row.nextAvailableAt ? String(row.nextAvailableAt) : null,
  }
}

export async function getPortalRawDownloadAccess(publicId: string) {
  const { admin, workspaceId } = await portalScope(publicId)
  const { data, error } = await admin.rpc('portal_raw_download_state', {
    p_workspace: workspaceId,
    p_public_id: publicId,
  })
  if (error) throw new Error(error.message)
  return normalizeAccess(data)
}

export async function requestPortalRawDownload(publicId: string, reason: string) {
  const cleanReason = reason.trim()
  if (cleanReason.length < PORTAL_RAW_DOWNLOAD_REASON_MIN || cleanReason.length > PORTAL_RAW_DOWNLOAD_REASON_MAX) {
    throw new Error(`Add a reason between ${PORTAL_RAW_DOWNLOAD_REASON_MIN} and ${PORTAL_RAW_DOWNLOAD_REASON_MAX} characters.`)
  }
  const { admin, workspaceId } = await portalScope(publicId)
  const { data, error } = await admin.rpc('request_portal_raw_download', {
    p_workspace: workspaceId,
    p_public_id: publicId,
    p_reason: cleanReason,
  })
  if (error) throw new Error(error.message)
  return data
}

export async function beginPortalRawDownload(publicId: string) {
  const { admin, workspaceId } = await portalScope(publicId)
  const { data, error } = await admin.rpc('begin_portal_raw_download', {
    p_workspace: workspaceId,
    p_public_id: publicId,
  })
  if (error) {
    if (/DOWNLOAD_LIMIT_REACHED/i.test(error.message)) {
      throw new Error('DOWNLOAD_LIMIT_REACHED')
    }
    throw new Error(error.message)
  }
  const attemptId = String((data as { attemptId?: unknown } | null)?.attemptId || '')
  if (!attemptId) throw new Error('The download could not be reserved.')
  return { attemptId }
}

export async function finishPortalRawDownload(attemptId: string, success: boolean) {
  const admin = adminClient()
  const { error } = await admin.rpc('finish_portal_raw_download', {
    p_attempt: attemptId,
    p_success: success,
  })
  if (error) throw new Error(error.message)
}

export async function listPortalRawDownloadRequests(workspaceId: string): Promise<PortalRawDownloadRequest[]> {
  const admin = adminClient()
  const { data, error } = await admin
    .from('portal_raw_download_requests')
    .select('id,booking_id,reason,requested_at')
    .eq('workspace_id', workspaceId)
    .eq('status', 'PENDING')
    .order('requested_at', { ascending: true })
    .limit(250)
  if (error) throw new Error(error.message)
  const bookingIds = [...new Set((data || []).map((row) => String(row.booking_id)))]
  const bookings = bookingIds.length
    ? await admin.from('bookings').select('id,customer_name,package_name,booking_date').eq('workspace_id', workspaceId).in('id', bookingIds)
    : { data: [], error: null }
  if (bookings.error) throw new Error(bookings.error.message)
  const bookingById = new Map((bookings.data || []).map((row) => [String(row.id), row]))
  return (data || []).map((row) => {
    const booking = bookingById.get(String(row.booking_id))
    return {
      id: String(row.id),
      bookingId: String(row.booking_id),
      customerName: String(booking?.customer_name || row.booking_id),
      packageName: String(booking?.package_name || ''),
      shootDate: String(booking?.booking_date || ''),
      reason: String(row.reason),
      requestedAt: String(row.requested_at),
    }
  })
}

export async function grantPortalRawDownload(workspaceId: string, requestId: string, actorId: string) {
  const admin = adminClient()
  const { data, error } = await admin.rpc('grant_portal_raw_download', {
    p_workspace: workspaceId,
    p_request: requestId,
    p_actor: actorId,
  })
  if (error) throw new Error(error.message)
  return data
}
