import { MAX_RAW_UPLOAD_BYTES, validateRawSessionUrl } from '@/lib/raw-upload-shared'

type Session = { grant: string; expiresAt: number; mimeType: string; uploadUrl?: string; driveFileId?: string; started?: boolean }
type ChunkResponse = { status: number; range: string | null; body: Record<string, unknown> }
const sessions = new WeakMap<File, Map<string, Session>>()
const CHUNK_BYTES = 4 * 1024 * 1024 // A multiple of Google's required 256 KiB.

class TransferError extends Error {
  constructor(message: string, readonly status = 0) { super(message) }
}

async function api(bookingId: string, action: string, payload: unknown) {
  const response = await fetch(`/api/editor-workflow/raw/${encodeURIComponent(bookingId)}/${action}`, {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(290_000),
  })
  const body = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok) throw new TransferError(String(body.error || 'The upload service did not respond. Try: refresh the page and retry.'), response.status)
  return body
}

function put(url: string, body: Blob | null, range: string, mimeType: string, progress: (bytes: number) => void) {
  return new Promise<ChunkResponse>((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('PUT', validateRawSessionUrl(url))
    // Do not send app cookies or Google access/refresh tokens to the upload endpoint.
    request.withCredentials = false
    request.timeout = 120_000
    request.setRequestHeader('Content-Type', mimeType)
    request.setRequestHeader('Content-Range', range)
    request.upload.addEventListener('progress', event => progress(Math.min(event.loaded, body?.size || 0)))
    request.addEventListener('error', () => reject(new TransferError('The connection was interrupted. Try: check your connection and retry the failed file.')))
    request.addEventListener('timeout', () => reject(new TransferError('The upload timed out. Try: check your connection and retry the failed file.')))
    request.addEventListener('abort', () => reject(new TransferError('The upload was cancelled. Try: retry the failed file.')))
    request.addEventListener('load', () => {
      let parsed: Record<string, unknown> = {}
      try { parsed = JSON.parse(request.responseText || '{}') } catch { /* 308 has no JSON body. */ }
      resolve({ status: request.status, range: request.getResponseHeader('Range'), body: parsed })
    })
    request.send(body)
  })
}

export function rawResumeOffset(range: string | null, total: number) {
  if (!range) return 0
  const match = /^bytes=0-(\d+)$/.exec(range)
  const next = match ? Number(match[1]) + 1 : NaN
  if (!Number.isSafeInteger(next) || next < 1 || next > total) {
    throw new TransferError('The upload position could not be verified. Try: refresh the page and retry.')
  }
  return next
}

/** Only the photo PUTs go to Drive. Session/confirmation requests to the app contain small JSON bodies. */
export async function uploadRawDirect(bookingId: string, file: File, onProgress: (loaded: number, total: number) => void) {
  if (!file.size || file.size > MAX_RAW_UPLOAD_BYTES) {
    throw new Error(`${file.name} must be between 1 byte and 100 MB. Try: select an original within that limit, or upload a larger original in Drive and use Sync Drive.`)
  }
  const byBooking = sessions.get(file) || new Map<string, Session>()
  sessions.set(file, byBooking)
  let session = byBooking.get(bookingId)
  if (session && session.expiresAt <= Date.now()) { byBooking.delete(bookingId); session = undefined }
  if (!session) {
    onProgress(0, file.size)
    const checksum = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())))
      .map(value => value.toString(16).padStart(2, '0')).join('')
    const response = await api(bookingId, 'upload-session', { fileName: file.name, fileSize: file.size, checksum })
    if (typeof response.grant !== 'string' || typeof response.expiresAt !== 'number' || typeof response.mimeType !== 'string' ||
      (typeof response.uploadUrl !== 'string' && typeof response.driveFileId !== 'string')) {
      throw new Error('The upload permission was incomplete. Try: refresh the page and retry.')
    }
    session = response as Session
    if (session.uploadUrl) validateRawSessionUrl(session.uploadUrl)
    byBooking.set(bookingId, session)
  }
  try {
    if (!session.driveFileId) {
      const url = session.uploadUrl!
      let offset = 0
      let queryPosition = Boolean(session.started)
      let failures = 0
      let stalls = 0
      while (!session.driveFileId) {
        let response: ChunkResponse
        try {
          if (queryPosition) {
            response = await put(url, null, `bytes */${file.size}`, session.mimeType, () => {})
          } else {
            session.started = true
            const end = Math.min(offset + CHUNK_BYTES, file.size)
            if (end <= offset) throw new TransferError('Drive has not confirmed the finished photo. Try: retry the failed file.')
            response = await put(url, file.slice(offset, end), `bytes ${offset}-${end - 1}/${file.size}`, session.mimeType,
              loaded => onProgress(Math.min(file.size, offset + loaded), file.size))
          }
        } catch (error) {
          if (!(error instanceof TransferError) || error.status || ++failures > 3) throw error
          queryPosition = true
          await new Promise(resolve => setTimeout(resolve, 500 * 2 ** failures))
          continue
        }
        if (response.status === 200 || response.status === 201) {
          if (typeof response.body.id !== 'string') throw new TransferError('Drive did not confirm a photo ID. Try: retry the failed file.')
          session.driveFileId = response.body.id
          break
        }
        if (response.status === 308) {
          const next = rawResumeOffset(response.range, file.size)
          if (next <= offset) {
            if (++stalls > 3) throw new TransferError('Drive is not accepting more data. Try: retry the failed file.')
          } else stalls = 0
          offset = next; queryPosition = next === file.size; failures = 0
          onProgress(offset, file.size)
          continue
        }
        if ((response.status >= 500 || response.status === 429) && ++failures <= 3) {
          queryPosition = true
          await new Promise(resolve => setTimeout(resolve, 500 * 2 ** failures))
          continue
        }
        throw new TransferError(response.status === 404 || response.status === 410
          ? 'The Drive upload session expired. Try: retry the failed file to start a fresh session.'
          : 'Google Drive could not accept the upload. Try: check available Drive storage and the studio Drive connection, then retry.', response.status)
      }
    }
    onProgress(file.size, file.size)
    const result = await api(bookingId, 'complete-file', { grant: session.grant, driveFileId: session.driveFileId })
    if (result.success !== true) throw new Error('The portal has not confirmed this photo. Try: retry the failed file.')
    byBooking.delete(bookingId)
    return result
  } catch (error) {
    if (error instanceof TransferError && [401, 403, 404, 410].includes(error.status)) byBooking.delete(bookingId)
    // Otherwise retain the same session/file ID in memory for Retry Failed, never in browser storage.
    throw error
  }
}
