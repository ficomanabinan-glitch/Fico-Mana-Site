import { Readable } from 'node:stream'
import { NextRequest, NextResponse } from 'next/server'
import { GraduationWorkflowOnlyError } from '@/lib/package-workflow'
import { requireWorkflowAuth } from '@/lib/auth-api'
import { canUseWorkflow, type WorkflowCapability } from '@/lib/auth/workflow'
import {
  assignEditingJob,
  completeDeliverableUpload,
  createBatchUploadRun,
  createDeliverableUploadSession,
  failDeliverableUpload,
  finalizeBatchUpload,
  finalizeClientUpload,
  getBatchDetail,
  getBatchFailedBookingIds,
  getBatchList,
  getOnsiteBatchSummary,
  getUploadReport,
  getPortalData,
  getPortalPhotoRevision,
  getPortalFile,
  getStaffGalleryFile,
  getStaffSelectionFiles,
  getWorkflowMembers,
  refreshRawFiles,
  prepareBatchDownload,
  prepareBatchCollectionDownload,
  preparePortalDeliverables,
  preparePortalRawPhotos,
  reconcileBookingStorage,
  recordMatchReviews,
  resolveMatchReview,
  saveRawFile,
  setClientSelectionStatus,
  setEditingJobStatus,
  submitPhotoSelection,
  PortalSelectionError,
  type EditingJobStatus,
} from '@/lib/editor-workflow'
import {
  beginPortalRawDownload,
  finishPortalRawDownload,
  getPortalRawDownloadAccess,
  grantPortalRawDownload,
  listPortalRawDownloadRequests,
  requestPortalRawDownload,
} from '@/lib/portal-raw-downloads'
import { getObject } from '@/lib/storage/storage-service'
import { API_RATE_LIMITS, enforceApiRateLimit } from '@/lib/security/api-rate-limit'
import { validateJpegThumbnailContent, validatePhotographyFileContent } from '@/lib/security/file-validation'
import {
  clientSelectionStatusSchema,
  editorBatchUploadFinalizeSchema,
  editorBatchUploadStartSchema,
  editorClientUploadFinalizeSchema,
  editorJobStatusSchema,
  editorUploadCompleteSchema,
  editorUploadFailureSchema,
  editorUploadSessionSchema,
  portalSelectionSchema,
  portalRawDownloadRequestSchema,
} from '@/lib/security/schemas'
import { recordSecurityAuditEvent } from '@/lib/security/security-audit'
import { scanUpload } from '@/lib/security/upload-scanner'
import { rejectUntrustedMutation } from '@/lib/security/request-security'
import { startRawUpload, completeRawUpload } from '@/lib/raw-upload-server'
import { rawUploadMetadataSchema, rawUploadCompleteSchema, RawUploadError } from '@/lib/raw-upload-contract'
import { beginOnsitePhotoReset, continueOnsitePhotoReset } from '@/lib/onsite-photo-reset'
import { reviewSelection, SelectionReviewError } from '@/lib/selection-review'
import { portalPagePayload } from '@/lib/portal-page-payload'
import { createEditorBatchDownloadRedirect, createPortalDownloadRedirect } from '@/lib/private-download-manifest'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
  })
}

function privateDownloadRedirect(location: string) {
  return new Response(null, {
    status: 307,
    headers: {
      location,
      'cache-control': 'private, no-store',
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
    },
  })
}

function safeDownloadName(value: string) {
  return value.replace(/["\r\n]/g, '').slice(0, 180) || 'download.zip'
}

function errorResponse(error: unknown, fallback: string, requestId: string, status = 400) {
  const message = error instanceof Error ? error.message : fallback
  const serverError = /unavailable|not configured/i.test(message)
  const exposeDetails = process.env.NODE_ENV !== 'production'
  return json(
    { error: exposeDetails ? message : fallback, requestId },
    serverError ? 503 : exposeDetails ? status : 500,
  )
}

async function handlePortal(request: NextRequest, path: string[]) {
  // The unguessable portal UUID is the shared viewing link. No browser cookie
  // is required; each reader below still checks expiry, status and ownership.
  const publicId = decodeURIComponent(path[1] || '').toLowerCase()
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(publicId)) {
    return json({ error: 'This portal link is invalid. Try: ask FICO MANA for the complete portal link.' }, 404)
  }
  const method = request.method.toUpperCase()
  if (method !== 'GET' && method !== 'HEAD') {
    const originError = rejectUntrustedMutation(request)
    if (originError) return originError
  }
  const policy = path[2] === 'selection'
    ? API_RATE_LIMITS.portalSelection
    : path[2] === 'raw-download-request'
      ? API_RATE_LIMITS.portalRawDownloadRequest
    : path[2] === 'raw-photos.zip'
      ? API_RATE_LIMITS.portalRawDownload
      : path[2] === 'deliverables.zip'
      ? API_RATE_LIMITS.portalDownload
      : API_RATE_LIMITS.portalRead
  const limited = await enforceApiRateLimit(request, policy, [publicId, path[2]])
  if (limited) return limited
  if (path.length === 3 && path[2] === 'photo-revision' && method === 'GET') {
    return json(await getPortalPhotoRevision(publicId))
  }
  if (path.length === 3 && path[2] === 'raw-download-state' && method === 'GET') {
    return json(await getPortalRawDownloadAccess(publicId))
  }
  if (path.length === 2 && method === 'GET') {
    const offset = Number(request.nextUrl.searchParams.get('offset') || 0)
    const limit = Number(request.nextUrl.searchParams.get('limit') || 48)
    const data = await getPortalData(publicId, offset, limit)
    const response = json(portalPagePayload(publicId, data))
    response.headers.set('Referrer-Policy', 'no-referrer')
    return response
  }
  if (path.length === 3 && path[2] === 'selection' && method === 'POST') {
    // IP-only quota: portals and devices on one network share attempts.
    const pinLimited = await enforceApiRateLimit(request, API_RATE_LIMITS.portalSubmissionPin)
    if (pinLimited) return pinLimited
    const parsed = portalSelectionSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return json({ error: 'A valid photo selection and 4-digit PIN are required. Try: review your choices and enter the last 4 digits of your booking phone number.', code: 'SELECTION_INVALID' }, 400)
    try {
      return json(await submitPhotoSelection(publicId, parsed.data))
    } catch (error) {
      if (error instanceof PortalSelectionError && error.code === 'SELECTION_PIN_INVALID') {
        await recordSecurityAuditEvent({ eventType: 'portal_submission_pin_failed', outcome: 'blocked', route: '/api/editor-workflow/portal/selection' })
      }
      throw error
    }
  }
  if (path[2] === 'file' && path[3] && method === 'GET') {
    const kind = request.nextUrl.searchParams.get('kind') === 'deliverable' ? 'deliverable' : 'gallery'
    const variant = request.nextUrl.searchParams.get('variant') === 'thumbnail' ? 'thumbnail' : 'preview'
    const file = await getPortalFile(publicId, decodeURIComponent(path[3]), kind, request.headers.get('if-none-match'), variant)
    if (!file.notModified && 'storageKey' in file) {
      const stored = await getObject(file.storageKey)
      if (!stored.Body) return json({ error: 'This photo is currently unavailable.' }, 404)
      return new Response(Readable.toWeb(Readable.from(stored.Body as AsyncIterable<Uint8Array>)) as ReadableStream, {
        headers: {
          'content-type': file.mimeType,
          'content-disposition': `inline; filename="${safeDownloadName(file.fileName)}"`,
          'cache-control': 'private, no-cache, must-revalidate',
          'cdn-cache-control': 'no-store',
          'vercel-cdn-cache-control': 'no-store',
          'etag': file.etag,
          'vary': 'Cookie',
          'x-content-type-options': 'nosniff',
          'referrer-policy': 'no-referrer',
        },
      })
    }
    return new Response(null, {
      status: 304,
      headers: {
        // The browser retains bytes but must re-check access and freshness on each reuse.
        'cache-control': 'private, no-cache, must-revalidate',
        'cdn-cache-control': 'no-store',
        'vercel-cdn-cache-control': 'no-store',
        'etag': file.etag,
        'vary': 'Cookie',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
      },
    })
  }
  if (path[2] === 'deliverables.zip' && method === 'GET') {
    const files = await preparePortalDeliverables(publicId)
    if (!files.length) return json({ error: 'No delivered photos are available yet.' }, 404)
    const location = await createPortalDownloadRedirect({
      publicId,
      kind: 'PORTAL_DELIVERABLES',
      entries: files,
      fileName: `${publicId}-FICO-MANA-PHOTOS.zip`,
    })
    return privateDownloadRedirect(location)
  }
  if (path.length === 3 && path[2] === 'raw-download-request' && method === 'POST') {
    const parsed = portalRawDownloadRequestSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return json({ error: 'Add a reason between 5 and 500 characters.' }, 400)
    try {
      return json({ success: true, request: await requestPortalRawDownload(publicId, parsed.data.reason) })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The request could not be sent.'
      return json({ error: message }, /already waiting|still available/i.test(message) ? 409 : 400)
    }
  }
  if (path[2] === 'raw-photos.zip' && method === 'GET') {
    const files = await preparePortalRawPhotos(publicId)
    if (!files.length) return json({ error: 'No original photos are available.' }, 404)
    let attemptId = ''
    try {
      attemptId = (await beginPortalRawDownload(publicId)).attemptId
    } catch (error) {
      if (error instanceof Error && error.message === 'DOWNLOAD_LIMIT_REACHED') {
        return json({ error: 'You have used both included downloads for this portal. Request another download access from the studio.' }, 429)
      }
      throw error
    }
    try {
      const location = await createPortalDownloadRedirect({
        publicId,
        kind: 'PORTAL_ORIGINALS',
        entries: files,
        fileName: `${publicId}-FICO-MANA-ORIGINALS.zip`,
        rawAttemptId: attemptId,
      })
      return privateDownloadRedirect(location)
    } catch (error) {
      await finishPortalRawDownload(attemptId, false).catch(() => undefined)
      throw error
    }
  }
  return json({ error: 'Unknown client portal workflow endpoint.' }, 404)
}

async function handle(request: NextRequest, path: string[]) {
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID()
  try {
    if (path[0] === 'portal') return await handlePortal(request, path)

    const { user, access, error } = await requireWorkflowAuth('view', request)
    if (error || !user || !access) return error || json({ error: 'Unauthorized' }, 401)
    const workspaceId = access.workspaceId
    const actorId = user.id
    const method = request.method.toUpperCase()
    const requireCapability = (capability: WorkflowCapability) =>
      canUseWorkflow(access, capability)
        ? null
        : json({ error: 'This staff role cannot perform that action.' }, 403)

    const expensiveEditorOperation =
      (path[0] === 'collections' && path[1] === 'download') ||
      (path[0] === 'batches' && ['download', 'start-upload', 'upload-session', 'complete-file', 'finalize-client', 'finalize-upload'].includes(path[2] || '')) ||
      (path[0] === 'folders' && method === 'POST') ||
      (path[0] === 'raw' && method === 'POST')
    if (expensiveEditorOperation) {
      const policy = (path[0] === 'batches' && ['start-upload', 'upload-session', 'complete-file', 'finalize-client', 'finalize-upload'].includes(path[2] || '')) ||
        (path[0] === 'raw' && ['upload-session', 'complete-file'].includes(path[2] || ''))
        ? API_RATE_LIMITS.editorUpload
        : API_RATE_LIMITS.storageOperation
      const limited = await enforceApiRateLimit(request, policy, [user.id, workspaceId,
        path[0] === 'raw' && policy === API_RATE_LIMITS.editorUpload ? 'raw-upload' : path.join('/')])
      if (limited) return limited
    }

    if (path[0] === 'session' && method === 'GET') {
      return json({
        user: { id: user.id, email: user.email || '', displayName: access.displayName },
        workspace: { id: workspaceId, name: access.workspaceName, slug: access.workspaceSlug },
        role: access.role,
        capabilities: {
          onsite: canUseWorkflow(access, 'onsite'),
          edit: canUseWorkflow(access, 'edit'),
          admin: canUseWorkflow(access, 'admin'),
        },
      })
    }

    if (path[0] === 'members' && method === 'GET') {
      const denied = requireCapability('admin')
      if (denied) return denied
      return json({ members: await getWorkflowMembers(workspaceId) })
    }

    if (path[0] === 'download-requests' && method === 'GET') {
      const denied = requireCapability('edit')
      if (denied) return denied
      return json({ requests: await listPortalRawDownloadRequests(workspaceId) })
    }
    if (path[0] === 'download-requests' && path[1] && path[2] === 'grant' && method === 'POST') {
      const denied = requireCapability('edit')
      if (denied) return denied
      const originError = rejectUntrustedMutation(request)
      if (originError) return originError
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(path[1])) {
        return json({ error: 'Invalid download request.' }, 400)
      }
      const limited = await enforceApiRateLimit(request, API_RATE_LIMITS.adminMutation, [user.id, workspaceId, 'grant-download'])
      if (limited) return limited
      return json({ success: true, request: await grantPortalRawDownload(workspaceId, decodeURIComponent(path[1]), actorId) })
    }

    if (path[0] === 'onsite' && method === 'GET') {
      const shootDate = request.nextUrl.searchParams.get('date') || ''
      if (!/^\d{4}-\d{2}-\d{2}$/.test(shootDate)) return json({ error: 'A valid shoot date is required.' }, 400)
      const synchronize = request.nextUrl.searchParams.get('fast') !== '1'
      const batch = await getOnsiteBatchSummary(workspaceId, shootDate, { synchronize })
      return json({ shootDate, batch })
    }

    if (path[0] === 'uploads' && path[1] === 'report' && method === 'GET') {
      const denied = requireCapability('edit')
      if (denied) return denied
      return json(await getUploadReport(workspaceId, Number(request.nextUrl.searchParams.get('limit') || 30)))
    }

    if (path[0] === 'files' && path[1] && method === 'GET') {
      const denied = requireCapability('edit')
      if (denied) return denied
      const limited = await enforceApiRateLimit(request, API_RATE_LIMITS.portalRead, [user.id, workspaceId, 'staff-file'])
      if (limited) return limited
      const variant = request.nextUrl.searchParams.get('variant') === 'thumbnail' ? 'thumbnail' : 'preview'
      const redirectUrl = await getStaffGalleryFile(workspaceId, decodeURIComponent(path[1]), variant)
      return NextResponse.redirect(redirectUrl, {
        status: 307,
        headers: { 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff' },
      })
    }

    if (path[0] === 'selections' && path[1] && path[2] === 'files' && method === 'GET') {
      const denied = requireCapability('edit')
      if (denied) return denied
      const selection = await getStaffSelectionFiles(workspaceId, decodeURIComponent(path[1]))
      if (!selection) return json({ error: 'This booking no longer has a submitted selection. Sync the queue and choose another client.' }, 404)
      return json(selection)
    }

    if (path[0] === 'folders' && path[1] && method === 'POST') {
      const denied = requireCapability('onsite')
      if (denied) return denied
      const body = (await request.json().catch(() => ({}))) as { repair?: boolean }
      return json(
        await reconcileBookingStorage(
          workspaceId,
          decodeURIComponent(path[1]),
          actorId,
          Boolean(body.repair),
        ),
      )
    }

    if (path[0] === 'collections' && path[1] === 'download' && method === 'GET') {
      const denied = requireCapability('edit')
      if (denied) return denied
      const scopeValue = request.nextUrl.searchParams.get('scope')
      const key = request.nextUrl.searchParams.get('key') || ''
      const scope = scopeValue === 'week' || scopeValue === 'month' ? scopeValue : 'day'
      const prepared = await prepareBatchCollectionDownload(
        workspaceId,
        scope,
        key,
        actorId,
        canUseWorkflow(access, 'admin'),
      )
      return privateDownloadRedirect(await createEditorBatchDownloadRedirect({
        workspaceId,
        actorId,
        entries: prepared.entries,
        fileName: prepared.fileName,
        batches: prepared.prepared.map((item) => ({ batchId: item.batch.id, jobs: item.jobs })),
      }))
    }

    if (path[0] === 'batches') {
      if (path.length === 1 && method === 'GET') {
        const synchronize = request.nextUrl.searchParams.get('sync') === '1'
        return json(await getBatchList(workspaceId, { synchronize }))
      }
      const batchId = decodeURIComponent(path[1] || '')
      if (!batchId) return json({ error: 'Batch ID required.' }, 400)
      if (path.length === 2 && method === 'GET') {
        const detail = await getBatchDetail(workspaceId, batchId)
        return detail ? json(detail) : json({ error: 'Batch not found.' }, 404)
      }
      if (path[2] === 'download' && method === 'GET') {
        const denied = requireCapability('edit')
        if (denied) return denied
        const prepared = await prepareBatchDownload(
          workspaceId,
          batchId,
          actorId,
          canUseWorkflow(access, 'admin'),
        )
        return privateDownloadRedirect(await createEditorBatchDownloadRedirect({
          workspaceId,
          actorId,
          entries: prepared.entries,
          fileName: prepared.fileName,
          batches: [{ batchId: prepared.batch.id, jobs: prepared.jobs }],
        }))
      }
      if (path[2] === 'failed' && method === 'GET') {
        return json({ bookingIds: await getBatchFailedBookingIds(workspaceId, batchId) })
      }
      if (path[2] === 'review-match' && method === 'POST') {
        const denied = requireCapability('edit')
        if (denied) return denied
        const body = (await request.json().catch(() => ({}))) as { folders?: unknown }
        const folders = Array.isArray(body.folders)
          ? body.folders.map((folder) =>
              typeof folder === 'string'
                ? { name: folder }
                : { name: String((folder as { name?: unknown }).name || ''), reason: String((folder as { reason?: unknown }).reason || '') },
            )
          : []
        return json(await recordMatchReviews(workspaceId, batchId, folders, actorId))
      }
      if (path[2] === 'start-upload' && method === 'POST') {
        const denied = requireCapability('edit')
        if (denied) return denied
        const parsed = editorBatchUploadStartSchema.safeParse(await request.json().catch(() => null))
        if (!parsed.success) return json({ error: 'The batch details are incomplete. Try: select the downloaded batch folder again.' }, 400)
        return json(await createBatchUploadRun(workspaceId, batchId, parsed.data.clients, actorId))
      }
      if (path[2] === 'upload-session' && method === 'POST') {
        const denied = requireCapability('edit')
        if (denied) return denied
        const parsed = editorUploadSessionSchema.safeParse(await request.json().catch(() => null))
        if (!parsed.success) return json({ error: 'The photo details are incomplete. Try: select the edited photos again.' }, 400)
        const body = parsed.data
        return json(
          await createDeliverableUploadSession(workspaceId, batchId, body.uploadJobId, {
            bookingId: body.bookingId,
            relativePath: body.relativePath,
            fileName: body.fileName,
            mimeType: body.mimeType,
            fileSize: body.fileSize,
            checksum: body.checksum,
          }),
        )
      }
      if (path[2] === 'complete-file' && method === 'POST') {
        const denied = requireCapability('edit')
        if (denied) return denied
        const parsed = editorUploadCompleteSchema.safeParse(await request.json().catch(() => null))
        if (!parsed.success) return json({ error: 'The upload could not be checked. Try: refresh the upload report.' }, 400)
        const body = parsed.data
        return json(
          await completeDeliverableUpload(workspaceId, body.uploadJobId, body.uploadFileId, {
            storageKey: body.storageKey,
            mimeType: body.mimeType,
            uploadId: body.uploadId,
            parts: body.parts,
          }),
        )
      }
      if (path[2] === 'fail-file' && method === 'POST') {
        const denied = requireCapability('edit')
        if (denied) return denied
        const parsed = editorUploadFailureSchema.safeParse(await request.json().catch(() => null))
        if (!parsed.success) return json({ error: 'The failed upload could not be recorded. Try: refresh the upload report.' }, 400)
        const body = parsed.data
        await failDeliverableUpload(workspaceId, body.uploadJobId, body.uploadFileId, body.error)
        return json({ success: true })
      }
      if (path[2] === 'finalize-client' && method === 'POST') {
        const denied = requireCapability('edit')
        if (denied) return denied
        const parsed = editorClientUploadFinalizeSchema.safeParse(await request.json().catch(() => null))
        if (!parsed.success) return json({ error: 'The client upload details are incomplete. Try: select the client folder again.' }, 400)
        const body = parsed.data
        return json(
          await finalizeClientUpload(
            workspaceId,
            batchId,
            body.uploadJobId,
            body.bookingId,
            actorId,
          ),
        )
      }
      if (path[2] === 'finalize-upload' && method === 'POST') {
        const denied = requireCapability('edit')
        if (denied) return denied
        const parsed = editorBatchUploadFinalizeSchema.safeParse(await request.json().catch(() => null))
        if (!parsed.success) return json({ error: 'The batch upload details are incomplete. Try: select the batch folder again.' }, 400)
        return json(await finalizeBatchUpload(workspaceId, batchId, parsed.data.uploadJobId))
      }
    }

    if (path[0] === 'raw' && path[1] && method === 'POST') {
      const denied = requireCapability('onsite')
      if (denied) return denied
      const bookingId = decodeURIComponent(path[1])
      if (path[2] === 'reset' && path.length === 3) {
        const text = await request.text()
        if (text.length > 1000) return json({ error: 'Invalid reset request.' }, 400)
        let body: { confirmBookingId?: string; resetId?: string }
        try { body = JSON.parse(text) } catch { return json({ error: 'Confirm the client before deleting photos.' }, 400) }
        if (!body || typeof body !== 'object' || body.confirmBookingId !== bookingId) return json({ error: 'Confirm the client before deleting photos.' }, 400)
        const context = { workspaceId, bookingId, actorId }
        if (body.resetId !== undefined && (typeof body.resetId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body.resetId))) return json({ error: 'Invalid reset reference.' }, 400)
        return json(body.resetId ? await continueOnsitePhotoReset(context, body.resetId) : await beginOnsitePhotoReset(context))
      }
      // Keep the existing route path for client compatibility; the operation now
      // refreshes database metadata for verified R2 objects rather than listing a folder.
      if (path[2] === 'index') return json(await refreshRawFiles(workspaceId, bookingId, actorId))
      if (path[2] === 'portal-email' && path.length === 3) {
        const [{ sendPortalAccessIfNeeded }, { getSupabaseAdmin }] = await Promise.all([
          import('@/lib/portal-email'), import('@/lib/supabase/admin'),
        ])
        const admin = getSupabaseAdmin()
        if (!admin) return json({ error: 'The email service is unavailable. Try: check Production settings, then retry the email.' }, 503)
        const result = await sendPortalAccessIfNeeded(admin, bookingId, { workspaceId, type: 'staff', id: actorId })
        if ('error' in result && result.error) return json({ error: result.error }, 502)
        if (!result.sent && !result.alreadySent) return json({ error: 'The portal email was not sent. Try: review the client portal and email settings.' }, 409)
        return json({ success: true, status: result.sent ? 'SENT' : 'ALREADY_SENT' })
      }
      if (path[2] === 'upload-session' || path[2] === 'complete-file') {
        if (path.length !== 3) return json({ error: 'Unknown upload action.' }, 404)
        // Only metadata enters the application; image bytes go straight to private R2.
        const body = await request.text()
        if (Buffer.byteLength(body, 'utf8') > 8000) return json({ error: 'Upload instructions are too large.' }, 413)
        let value: unknown
        try { value = JSON.parse(body) } catch { return json({ error: 'Valid upload instructions are required.' }, 400) }
        const context = { workspaceId, bookingId, actorId }
        if (path[2] === 'upload-session') {
          const parsed = rawUploadMetadataSchema.safeParse(value)
          if (!parsed.success) return json({ error: 'Choose a supported photo up to 100 MB with a filename of at most 120 characters. Try: check the file and select it again.' }, 400)
          return json(await startRawUpload(context, parsed.data))
        }
        const parsed = rawUploadCompleteSchema.safeParse(value)
        if (!parsed.success) return json({ error: 'Upload confirmation is invalid. Try: select the file again.' }, 400)
        return json(await completeRawUpload(context, parsed.data.grant, {
          storageKey: parsed.data.storageKey,
          uploadId: parsed.data.uploadId,
          parts: parsed.data.parts,
        }))
      }
      if (path.length !== 2) return json({ error: 'Unknown upload action.' }, 404)
      const form = await request.formData()
      const file = form.get('file')
      const thumbnail = form.get('thumbnail')
      if (!(file instanceof File)) return json({ error: 'RAW image file required.' }, 400)
      if (thumbnail !== null && !(thumbnail instanceof File)) return json({ error: 'Invalid RAW thumbnail.' }, 400)
      const rawExtension = /\.(jpe?g|png|webp|tiff?|heic|heif|dng|cr2|cr3|nef|arw|orf|rw2|raf)$/i.test(file.name)
      if (!file.type.startsWith('image/') && !rawExtension) {
        return json({ error: 'Only supported photo and camera RAW files can be added to the gallery.' }, 415)
      }
      if (file.size > 100 * 1024 * 1024) return json({ error: 'RAW upload is limited to 100 MB per file.' }, 413)
      const data = Buffer.from(await file.arrayBuffer())
      let thumbnailData: Buffer | null = null
      try {
        validatePhotographyFileContent(data, file.name)
        if (thumbnail instanceof File) {
          if (thumbnail.size <= 0 || thumbnail.size > 2 * 1024 * 1024 || thumbnail.type !== 'image/jpeg') {
            throw new Error('The RAW thumbnail must be a JPEG no larger than 2 MB.')
          }
          thumbnailData = Buffer.from(await thumbnail.arrayBuffer())
          await validateJpegThumbnailContent(thumbnailData)
        }
      } catch (validationError) {
        await recordSecurityAuditEvent({
          eventType: 'suspicious_file_rejected',
          outcome: 'blocked',
          actorId,
          workspaceId,
          bookingId,
          route: '/api/editor-workflow/raw',
          metadata: { reason: validationError instanceof Error ? validationError.message : 'invalid_content' },
        })
        return json({ error: validationError instanceof Error ? validationError.message : 'Invalid photo file.' }, 415)
      }
      const scan = await scanUpload({ buffer: data, fileName: file.name, mimeType: file.type, purpose: 'raw-photo' })
      if (scan.status === 'rejected') return json({ error: scan.reason }, 415)
      const gallery = await saveRawFile({
        workspaceId,
        bookingId,
        actorId,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        data,
        thumbnail: thumbnailData,
      })
      return json({ success: true, file: gallery })
    }

    if (path[0] === 'selections' && path[1] && path[2] === 'reopen' && method === 'POST') {
      const denied = requireCapability('admin')
      if (denied) return denied
      const body = (await request.json().catch(() => ({}))) as { submittedAt?: unknown }
      return json(await reviewSelection(workspaceId, actorId, decodeURIComponent(path[1]), {
        action: 'Reopen',
        notes: 'Reopened by the studio',
        submittedAt: body.submittedAt,
      }))
    }
    if (path[0] === 'selections' && path[1] && path[2] === 'status' && method === 'PATCH') {
      const denied = requireCapability('admin')
      if (denied) return denied
      const parsed = clientSelectionStatusSchema.safeParse(await request.json().catch(() => null))
      if (!parsed.success) return json({ error: 'A valid client selection status is required.' }, 400)
      return json(await setClientSelectionStatus(workspaceId, decodeURIComponent(path[1]), parsed.data.status, actorId))
    }
    if (path[0] === 'jobs' && path[1] && path[2] === 'assign' && method === 'POST') {
      const denied = requireCapability('edit')
      if (denied) return denied
      const body = (await request.json().catch(() => ({}))) as { assigneeId?: string | null }
      const assigneeId = body.assigneeId === null ? null : String(body.assigneeId || actorId)
      if (!canUseWorkflow(access, 'admin') && assigneeId !== null && assigneeId !== actorId) {
        return json({ error: 'Editors may only claim jobs for themselves.' }, 403)
      }
      return json(
        await assignEditingJob(
          workspaceId,
          decodeURIComponent(path[1]),
          actorId,
          assigneeId,
          canUseWorkflow(access, 'admin'),
        ),
      )
    }
    if (path[0] === 'jobs' && path[1] && method === 'PATCH') {
      const denied = requireCapability('edit')
      if (denied) return denied
      const parsed = editorJobStatusSchema.safeParse(await request.json().catch(() => null))
      if (!parsed.success) return json({ error: 'A valid editing status is required.' }, 400)
      const bookingId = decodeURIComponent(path[1])
      if (!canUseWorkflow(access, 'admin')) {
        await assignEditingJob(workspaceId, bookingId, actorId, actorId, false)
      }
      return json(
        await setEditingJobStatus(
          workspaceId,
          bookingId,
          parsed.data.status as EditingJobStatus,
          actorId,
        ),
      )
    }
    if (path[0] === 'matches' && path[1] && path[2] === 'resolve' && method === 'POST') {
      const denied = requireCapability('edit')
      if (denied) return denied
      const body = (await request.json().catch(() => ({}))) as { bookingId?: string }
      if (!body.bookingId) return json({ error: 'A batch client is required.' }, 400)
      return json(await resolveMatchReview(workspaceId, decodeURIComponent(path[1]), String(body.bookingId), actorId))
    }
    return json({ error: 'Unknown editor workflow endpoint.' }, 404)
  } catch (error) {
    if (error instanceof PortalSelectionError) return json({ error: error.message, code: error.code, requestId }, error.status)
    if (error instanceof RawUploadError) return json({ error: error.message, requestId }, error.status)
    if (error instanceof GraduationWorkflowOnlyError) return json({ error: error.message, requestId }, 409)
    if (error instanceof SelectionReviewError) return json({ error: error.message, requestId }, 409)
    console.error(`Editor workflow ${request.method} /${path.join('/')} [${requestId}]:`, error)
    return errorResponse(error, 'Editor workflow request failed.', requestId)
  }
}

async function dispatch(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path = [] } = await context.params
  return handle(request, path)
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return dispatch(request, context)
}

export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return dispatch(request, context)
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return dispatch(request, context)
}
