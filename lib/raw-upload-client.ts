import { MAX_RAW_UPLOAD_BYTES } from '@/lib/raw-upload-shared'
import { uploadWithPresignedPlan, type BrowserUploadPlan } from '@/lib/storage/browser-upload'

type Session = {
  grant: string
  expiresAt: number
  mimeType: string
  storageKey: string
  completed?: boolean
  upload?: BrowserUploadPlan
}

const sessions = new WeakMap<File, Map<string, Session>>()
const sessionStarts = new Map<string, Promise<unknown>>()

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

async function startSession(bookingId: string, payload: unknown) {
  const previous = sessionStarts.get(bookingId) || Promise.resolve()
  const pending = previous.catch(() => {}).then(() => api(bookingId, 'upload-session', payload))
  sessionStarts.set(bookingId, pending)
  try { return await pending } finally { if (sessionStarts.get(bookingId) === pending) sessionStarts.delete(bookingId) }
}

/** File bytes go directly from the browser to private R2; app requests contain metadata only. */
export async function uploadRawDirect(bookingId: string, file: File, onProgress: (loaded: number, total: number) => void) {
  if (!file.size || file.size > MAX_RAW_UPLOAD_BYTES) {
    throw new Error(`${file.name} must be between 1 byte and 100 MB.`)
  }
  const byBooking = sessions.get(file) || new Map<string, Session>()
  sessions.set(file, byBooking)
  let session = byBooking.get(bookingId)
  if (session && session.expiresAt <= Date.now()) { byBooking.delete(bookingId); session = undefined }
  if (!session) {
    onProgress(0, file.size)
    const checksum = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())))
      .map(value => value.toString(16).padStart(2, '0')).join('')
    const response = await startSession(bookingId, { fileName: file.name, fileSize: file.size, checksum })
    if (typeof response.grant !== 'string' || typeof response.expiresAt !== 'number' ||
      typeof response.mimeType !== 'string' || typeof response.storageKey !== 'string' ||
      (!response.completed && (!response.upload || typeof response.upload !== 'object'))) {
      throw new Error('The upload permission was incomplete. Try: refresh the page and retry.')
    }
    session = response as unknown as Session
    byBooking.set(bookingId, session)
  }

  try {
    const completion = session.completed || !session.upload
      ? {}
      : await uploadWithPresignedPlan(file, session.upload, onProgress)
    // Once R2 has accepted every byte, a transient app confirmation failure must
    // retry metadata finalization only. Re-uploading a 50-100 MB original wastes
    // bandwidth and can create unnecessary multipart work for the client.
    session.completed = true
    session.upload = undefined
    onProgress(file.size, file.size)
    const result = await api(bookingId, 'complete-file', {
      grant: session.grant,
      storageKey: session.storageKey,
      ...completion,
    })
    if (result.success !== true) throw new Error('The portal has not confirmed this photo. Try: retry the failed file.')
    byBooking.delete(bookingId)
    return result
  } catch (error) {
    if (error instanceof TransferError && [401, 403, 404, 410].includes(error.status)) byBooking.delete(bookingId)
    throw error
  }
}
