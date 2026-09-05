import { PassThrough, Readable } from 'node:stream'
import archiver from 'archiver'
import { NextRequest, NextResponse } from 'next/server'
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
  getPortalData,
  getPortalFile,
  getWorkflowMembers,
  indexRawFolder,
  markBatchDownloaded,
  prepareBatchDownload,
  prepareBatchCollectionDownload,
  preparePortalDeliverables,
  reconcileBookingFolders,
  recordMatchReviews,
  reopenPhotoSelection,
  resolveMatchReview,
  saveRawFile,
  setEditingJobStatus,
  submitPhotoSelection,
  type EditingJobStatus,
} from '@/lib/editor-workflow'
import { openDriveFile } from '@/lib/google-drive'
import {
  PORTAL_SESSION_COOKIE,
  verifyPortalCookie,
  verifyPortalSignature,
} from '@/lib/client-portal'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

type ZipEntry = { name: string; data?: Buffer; driveFileId?: string }

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
  })
}

function safeDownloadName(value: string) {
  return value.replace(/["\r\n]/g, '').slice(0, 180) || 'download.zip'
}

function errorResponse(error: unknown, fallback: string, status = 400) {
  const message = error instanceof Error ? error.message : fallback
  const serverError = /unavailable|not configured/i.test(message)
  return json({ error: message }, serverError ? 503 : status)
}

function portalAuthorized(request: NextRequest, publicId: string) {
  return (
    verifyPortalSignature(publicId, request.nextUrl.searchParams.get('sig')) ||
    verifyPortalCookie(request.cookies.get(PORTAL_SESSION_COOKIE)?.value, publicId)
  )
}

function lazyDriveStream(fileId: string) {
  return Readable.from(
    (async function* () {
      const response = await openDriveFile(fileId)
      const stream = Readable.fromWeb(response.body as import('node:stream/web').ReadableStream)
      for await (const chunk of stream) yield chunk
    })(),
  )
}

function zipResponse(
  entries: ZipEntry[],
  fileName: string,
  onComplete?: () => Promise<void>,
) {
  const output = new PassThrough()
  const archive = archiver('zip', { zlib: { level: 0 } })
  archive.on('error', (error) => output.destroy(error))
  archive.pipe(output)
  for (const entry of entries) {
    if (entry.driveFileId) archive.append(lazyDriveStream(entry.driveFileId), { name: entry.name })
    else archive.append(entry.data || Buffer.alloc(0), { name: entry.name })
  }
  void archive.finalize()
  if (onComplete) {
    output.once('end', () => void onComplete().catch((error) => console.error('ZIP completion update failed:', error)))
  }
  return new Response(Readable.toWeb(output) as ReadableStream, {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="${safeDownloadName(fileName)}"`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  })
}

async function handlePortal(request: NextRequest, path: string[]) {
  const publicId = decodeURIComponent(path[1] || '')
  if (!publicId || !portalAuthorized(request, publicId)) {
    return json({ error: 'Private client portal link required.' }, 403)
  }
  const method = request.method.toUpperCase()
  const sig = request.nextUrl.searchParams.get('sig')
  const suffix = sig ? `?sig=${encodeURIComponent(sig)}` : ''
  if (path.length === 2 && method === 'GET') {
    const offset = Number(request.nextUrl.searchParams.get('offset') || 0)
    const limit = Number(request.nextUrl.searchParams.get('limit') || 48)
    const data = await getPortalData(publicId, offset, limit)
    return json({
      ...data,
      gallery: data.gallery.map((file) => ({
        ...file,
        previewUrl: `/api/editor-workflow/portal/${encodeURIComponent(publicId)}/file/${encodeURIComponent(file.id)}${suffix}${suffix ? '&' : '?'}kind=gallery`,
      })),
      deliverables: data.deliverables.map((file) => ({
        ...file,
        previewUrl: `/api/editor-workflow/portal/${encodeURIComponent(publicId)}/file/${encodeURIComponent(file.id)}${suffix}${suffix ? '&' : '?'}kind=deliverable`,
      })),
      downloadAllUrl: `/api/editor-workflow/portal/${encodeURIComponent(publicId)}/deliverables.zip${suffix}`,
    })
  }
  if (path[2] === 'selection' && method === 'POST') {
    const body = (await request.json().catch(() => ({}))) as { fileIds?: unknown }
    const fileIds = Array.isArray(body.fileIds) ? body.fileIds.map(String) : []
    return json(await submitPhotoSelection(publicId, fileIds))
  }
  if (path[2] === 'file' && path[3] && method === 'GET') {
    const kind = request.nextUrl.searchParams.get('kind') === 'deliverable' ? 'deliverable' : 'gallery'
    const file = await getPortalFile(publicId, decodeURIComponent(path[3]), kind)
    return new Response(file.data, {
      headers: {
        'content-type': file.mimeType,
        'cache-control': 'private, max-age=300',
        'x-content-type-options': 'nosniff',
        ...(kind === 'deliverable' && file.fileName
          ? { 'content-disposition': `inline; filename="${safeDownloadName(file.fileName)}"` }
          : {}),
      },
    })
  }
  if (path[2] === 'deliverables.zip' && method === 'GET') {
    const files = await preparePortalDeliverables(publicId)
    if (!files.length) return json({ error: 'No delivered photos are available yet.' }, 404)
    return zipResponse(files, `${publicId}-FICO-MANA-PHOTOS.zip`)
  }
  return json({ error: 'Unknown client portal workflow endpoint.' }, 404)
}

async function handle(request: NextRequest, path: string[]) {
  try {
    if (path[0] === 'portal') return await handlePortal(request, path)

    const { user, access, error } = await requireWorkflowAuth()
    if (error || !user || !access) return error || json({ error: 'Unauthorized' }, 401)
    const workspaceId = access.workspaceId
    const actorId = user.id
    const method = request.method.toUpperCase()
    const requireCapability = (capability: WorkflowCapability) =>
      canUseWorkflow(access, capability)
        ? null
        : json({ error: 'This staff role cannot perform that action.' }, 403)

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

    if (path[0] === 'onsite' && method === 'GET') {
      const shootDate = request.nextUrl.searchParams.get('date') || ''
      if (!/^\d{4}-\d{2}-\d{2}$/.test(shootDate)) return json({ error: 'A valid shoot date is required.' }, 400)
      const batch = (await getBatchList(workspaceId)).find((item) => item.shootDate === shootDate)
      const detail = batch ? await getBatchDetail(workspaceId, batch.id) : null
      return json({ shootDate, batch: detail })
    }

    if (path[0] === 'folders' && path[1] && method === 'POST') {
      const denied = requireCapability('onsite')
      if (denied) return denied
      const body = (await request.json().catch(() => ({}))) as { repair?: boolean }
      return json(
        await reconcileBookingFolders(
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
      return zipResponse(prepared.entries, prepared.fileName, async () => {
        for (const item of prepared.prepared) {
          await markBatchDownloaded(workspaceId, item.batch.id, item.jobs, actorId)
        }
      })
    }

    if (path[0] === 'batches') {
      if (path.length === 1 && method === 'GET') return json(await getBatchList(workspaceId))
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
        return zipResponse(prepared.entries, prepared.fileName, () =>
          markBatchDownloaded(workspaceId, prepared.batch.id, prepared.jobs, actorId),
        )
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
        const body = (await request.json().catch(() => ({}))) as { bookingIds?: unknown }
        const bookingIds = Array.isArray(body.bookingIds) ? body.bookingIds.map(String) : []
        return json(await createBatchUploadRun(workspaceId, batchId, bookingIds, actorId, canUseWorkflow(access, 'admin')))
      }
      if (path[2] === 'upload-session' && method === 'POST') {
        const denied = requireCapability('edit')
        if (denied) return denied
        const body = (await request.json()) as {
          uploadJobId: string
          bookingId: string
          relativePath: string
          fileName: string
          mimeType: string
          fileSize: number
          checksum: string
        }
        return json(
          await createDeliverableUploadSession(workspaceId, batchId, String(body.uploadJobId), {
            bookingId: String(body.bookingId),
            relativePath: String(body.relativePath),
            fileName: String(body.fileName),
            mimeType: String(body.mimeType || 'application/octet-stream'),
            fileSize: Number(body.fileSize),
            checksum: String(body.checksum),
          }),
        )
      }
      if (path[2] === 'complete-file' && method === 'POST') {
        const denied = requireCapability('edit')
        if (denied) return denied
        const body = (await request.json()) as {
          uploadJobId: string
          uploadFileId: string
          driveFileId: string
          mimeType: string
        }
        return json(
          await completeDeliverableUpload(
            workspaceId,
            String(body.uploadJobId),
            String(body.uploadFileId),
            String(body.driveFileId),
            String(body.mimeType || 'application/octet-stream'),
          ),
        )
      }
      if (path[2] === 'fail-file' && method === 'POST') {
        const denied = requireCapability('edit')
        if (denied) return denied
        const body = (await request.json()) as { uploadJobId: string; uploadFileId: string; error: string }
        await failDeliverableUpload(workspaceId, String(body.uploadJobId), String(body.uploadFileId), String(body.error))
        return json({ success: true })
      }
      if (path[2] === 'finalize-client' && method === 'POST') {
        const denied = requireCapability('edit')
        if (denied) return denied
        const body = (await request.json()) as { uploadJobId: string; bookingId: string }
        return json(
          await finalizeClientUpload(
            workspaceId,
            batchId,
            String(body.uploadJobId),
            String(body.bookingId),
            actorId,
          ),
        )
      }
      if (path[2] === 'finalize-upload' && method === 'POST') {
        const denied = requireCapability('edit')
        if (denied) return denied
        const body = (await request.json()) as { uploadJobId: string }
        return json(await finalizeBatchUpload(workspaceId, batchId, String(body.uploadJobId)))
      }
    }

    if (path[0] === 'raw' && path[1] && method === 'POST') {
      const denied = requireCapability('onsite')
      if (denied) return denied
      const bookingId = decodeURIComponent(path[1])
      if (path[2] === 'index') return json(await indexRawFolder(workspaceId, bookingId, actorId))
      const form = await request.formData()
      const file = form.get('file')
      const thumbnail = form.get('thumbnail')
      if (!(file instanceof File)) return json({ error: 'RAW image file required.' }, 400)
      const rawExtension = /\.(jpe?g|png|webp|tiff?|heic|heif|dng|cr2|cr3|nef|arw|orf|rw2|raf)$/i.test(file.name)
      if (!file.type.startsWith('image/') && !rawExtension) {
        return json({ error: 'Only supported photo and camera RAW files can be added to the gallery.' }, 415)
      }
      if (file.size > 100 * 1024 * 1024) return json({ error: 'RAW upload is limited to 100 MB per file.' }, 413)
      const gallery = await saveRawFile({
        workspaceId,
        bookingId,
        actorId,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        data: Buffer.from(await file.arrayBuffer()),
        thumbnail: thumbnail instanceof File ? Buffer.from(await thumbnail.arrayBuffer()) : null,
      })
      return json({ success: true, file: gallery })
    }

    if (path[0] === 'selections' && path[1] && path[2] === 'reopen' && method === 'POST') {
      const denied = requireCapability('admin')
      if (denied) return denied
      return json(await reopenPhotoSelection(workspaceId, decodeURIComponent(path[1]), actorId))
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
      const body = (await request.json()) as { status?: string }
      const bookingId = decodeURIComponent(path[1])
      if (!canUseWorkflow(access, 'admin')) {
        await assignEditingJob(workspaceId, bookingId, actorId, actorId, false)
      }
      return json(
        await setEditingJobStatus(
          workspaceId,
          bookingId,
          String(body.status || '') as EditingJobStatus,
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
    console.error(`Editor workflow ${request.method} /${path.join('/')}:`, error)
    return errorResponse(error, 'Editor workflow request failed.')
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
