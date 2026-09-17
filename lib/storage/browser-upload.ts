import { validateRawSessionUrl } from '@/lib/raw-upload-shared'

export type BrowserUploadPlan =
  | { mode: 'single'; url: string; headers: Record<string, string> }
  | { mode: 'multipart'; uploadId: string; partSize: number; parts: Array<{ partNumber: number; url: string }> }

export type BrowserUploadCompletion = {
  uploadId?: string
  parts?: Array<{ partNumber: number; etag: string }>
}

class BrowserUploadError extends Error {
  constructor(message: string, readonly status = 0) {
    super(message)
    this.name = 'BrowserUploadError'
  }
}

function connectionMessage(fileName: string) {
  return typeof navigator !== 'undefined' && navigator.onLine === false
    ? `This browser is offline. Reconnect and retry ${fileName}.`
    : `The browser could not upload ${fileName}. Check the connection, VPN, or privacy extension, then retry.`
}

function put(
  url: string,
  body: Blob,
  headers: Record<string, string>,
  onProgress: (loaded: number) => void,
) {
  return new Promise<{ etag: string | null }>((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('PUT', validateRawSessionUrl(url))
    request.withCredentials = false
    request.timeout = 180_000
    for (const [name, value] of Object.entries(headers)) request.setRequestHeader(name, value)
    request.upload.addEventListener('progress', (event) => onProgress(Math.min(event.loaded, body.size)))
    request.addEventListener('error', () => reject(new BrowserUploadError(connectionMessage('the file'))))
    request.addEventListener('timeout', () => reject(new BrowserUploadError('The upload timed out. Check the connection and retry.')))
    request.addEventListener('abort', () => reject(new BrowserUploadError('The upload was cancelled. Retry the file when ready.')))
    request.addEventListener('load', () => {
      if (request.status >= 200 && request.status < 300) {
        resolve({ etag: request.getResponseHeader('ETag') })
      } else {
        reject(new BrowserUploadError(
          request.status === 403
            ? 'The upload permission expired. Retry the file to request a new one.'
            : 'Private storage could not accept the file. Retry in a moment.',
          request.status,
        ))
      }
    })
    request.send(body)
  })
}

async function withRetry<T>(operation: () => Promise<T>) {
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      if (error instanceof BrowserUploadError && error.status >= 400 && error.status < 500) break
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt))
    }
  }
  throw lastError
}

export async function uploadWithPresignedPlan(
  file: File,
  plan: BrowserUploadPlan,
  onProgress: (loaded: number, total: number) => void,
): Promise<BrowserUploadCompletion> {
  if (plan.mode === 'single') {
    await withRetry(() => put(plan.url, file, plan.headers, (loaded) => onProgress(loaded, file.size)))
    onProgress(file.size, file.size)
    return {}
  }

  if (!Number.isInteger(plan.partSize) || plan.partSize < 5 * 1024 * 1024 || !plan.parts.length) {
    throw new Error('The resumable upload plan is invalid. Retry the file.')
  }
  const completed: Array<{ partNumber: number; etag: string }> = []
  let committed = 0
  for (const part of [...plan.parts].sort((left, right) => left.partNumber - right.partNumber)) {
    const start = (part.partNumber - 1) * plan.partSize
    const end = Math.min(file.size, start + plan.partSize)
    if (start >= end) throw new Error('The resumable upload plan does not match this file.')
    const chunk = file.slice(start, end)
    const response = await withRetry(() => put(part.url, chunk, {}, (loaded) => onProgress(committed + loaded, file.size)))
    if (!response.etag) throw new Error('Private storage did not return a part receipt. Check the R2 CORS ETag setting and retry.')
    completed.push({ partNumber: part.partNumber, etag: response.etag })
    committed += chunk.size
    onProgress(committed, file.size)
  }
  return { uploadId: plan.uploadId, parts: completed }
}
