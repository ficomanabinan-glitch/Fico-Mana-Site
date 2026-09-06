export type PickedUploadFile = {
  file: File
  relativePath: string
}

export type UploadManifestClient = {
  booking_id: string
  client_id: string
  folder_name: string
  customer_name: string
  expected_output_count: number
}

export type BatchUploadManifest = {
  schema_version: number
  batch_id: string
  shoot_date: string
  clients: UploadManifestClient[]
}

export type DetectedBatchFolder = {
  manifest: BatchUploadManifest
  manifestPath: string
  rootPath: string
  files: PickedUploadFile[]
}

export type UploadProgress = {
  batchId: string
  shootDate: string
  clientName: string
  currentFile: string
  clientsDone: number
  clientsTotal: number
  filesDone: number
  filesTotal: number
  bytesDone: number
  bytesTotal: number
}

export type UploadResult = {
  bookingId: string
  customerName: string
  status: string
  expected: number
  uploaded: number
  error?: string | null
}

export type BatchUploadSummary = {
  id: string
  status: string
  totalClients: number
  completedClients: number
  failedClients: number
  photosUploaded: number
  batchStatus: string
  failedBookingIds: string[]
}

type FileEntry = {
  isFile: true
  isDirectory: false
  name: string
  file: (success: (file: File) => void, failure?: (error: DOMException) => void) => void
}

type DirectoryEntry = {
  isFile: false
  isDirectory: true
  name: string
  createReader: () => {
    readEntries: (
      success: (entries: LocalFileSystemEntry[]) => void,
      failure?: (error: DOMException) => void,
    ) => void
  }
}

type LocalFileSystemEntry = FileEntry | DirectoryEntry

type UploadWork = {
  client: UploadManifestClient
  edited: Array<{ file: File; relativePath: string }>
}

const EDITABLE_STATUSES = new Set(['DOWNLOADED', 'EDITING', 'READY_TO_UPLOAD', 'UPLOAD_FAILED'])

function normalizePath(value: string) {
  return value.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
}

function pathName(value: string) {
  return normalizePath(value).split('/').pop() || value
}

function parentPath(value: string) {
  const parts = normalizePath(value).split('/')
  parts.pop()
  return parts.join('/')
}

async function responseJson(response: Response) {
  return (await response.json().catch(() => ({}))) as Record<string, unknown>
}

async function readDirectory(reader: ReturnType<DirectoryEntry['createReader']>) {
  const found: LocalFileSystemEntry[] = []
  for (;;) {
    const chunk = await new Promise<LocalFileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject),
    )
    if (!chunk.length) break
    found.push(...chunk)
  }
  return found
}

async function readEntry(entry: LocalFileSystemEntry, parent = ''): Promise<PickedUploadFile[]> {
  const relativePath = normalizePath(parent ? `${parent}/${entry.name}` : entry.name)
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => entry.file(resolve, reject))
    return [{ file, relativePath }]
  }
  const children = await readDirectory(entry.createReader())
  const nested = await Promise.all(children.map((child) => readEntry(child, relativePath)))
  return nested.flat()
}

export function pickedFilesFromList(files: FileList | File[]) {
  return Array.from(files).map((file) => ({
    file,
    relativePath: normalizePath(file.webkitRelativePath || file.name),
  }))
}

export async function pickedFilesFromDrop(dataTransfer: DataTransfer) {
  const entries = Array.from(dataTransfer.items)
    .map((item) =>
      (item as unknown as { webkitGetAsEntry?: () => LocalFileSystemEntry | null })
        .webkitGetAsEntry?.(),
    )
    .filter((entry): entry is LocalFileSystemEntry => Boolean(entry))
  if (!entries.length) return pickedFilesFromList(dataTransfer.files)
  return (await Promise.all(entries.map((entry) => readEntry(entry)))).flat()
}

function isBatchManifest(value: unknown): value is BatchUploadManifest {
  if (!value || typeof value !== 'object') return false
  const manifest = value as Partial<BatchUploadManifest>
  return (
    typeof manifest.batch_id === 'string' &&
    typeof manifest.shoot_date === 'string' &&
    Array.isArray(manifest.clients) &&
    manifest.clients.every(
      (client) =>
        client &&
        typeof client.booking_id === 'string' &&
        typeof client.folder_name === 'string',
    )
  )
}

export async function detectBatchFolders(files: PickedUploadFile[]) {
  const candidates = files.filter((item) => pathName(item.relativePath).toLowerCase() === 'manifest.json')
  const detected: DetectedBatchFolder[] = []
  for (const candidate of candidates) {
    let parsed: unknown
    try {
      parsed = JSON.parse(await candidate.file.text())
    } catch {
      continue
    }
    if (!isBatchManifest(parsed)) continue
    const rootPath = parentPath(candidate.relativePath)
    const scopedFiles = files.filter((item) => {
      const path = normalizePath(item.relativePath)
      return !rootPath || path === rootPath || path.startsWith(`${rootPath}/`)
    })
    const previous = detected.findIndex((item) => item.manifest.batch_id === parsed.batch_id)
    const next = { manifest: parsed, manifestPath: candidate.relativePath, rootPath, files: scopedFiles }
    if (previous < 0) detected.push(next)
    else if (scopedFiles.length > detected[previous].files.length) detected[previous] = next
  }
  return detected.sort((a, b) => a.manifest.shoot_date.localeCompare(b.manifest.shoot_date))
}

export function createUploadWork(batch: DetectedBatchFolder, allowedBookingIds: Set<string>) {
  const work: UploadWork[] = []
  for (const client of batch.manifest.clients) {
    if (!allowedBookingIds.has(String(client.booking_id))) continue
    const edited = batch.files
      .map((item) => {
        const parts = normalizePath(item.relativePath).split('/')
        const clientIndex = parts.findIndex(
          (part) => part.toLowerCase() === client.folder_name.toLowerCase(),
        )
        if (clientIndex < 0) return null
        const afterClient = parts.slice(clientIndex + 1)
        const editedFolder = afterClient.shift()?.toUpperCase()
        if (editedFolder !== 'EDITED' && editedFolder !== 'EDITED PHOTOS') return null
        if (!afterClient.length || ['manifest.json', '.fico-client.json'].includes(item.file.name)) return null
        return { file: item.file, relativePath: `EDITED/${afterClient.join('/')}` }
      })
      .filter((item): item is { file: File; relativePath: string } => Boolean(item))
    work.push({ client, edited })
  }
  return work
}

async function sha256(file: File) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function putDriveFile(
  uploadUrl: string,
  file: File,
  onProgress: (loaded: number, total: number) => void,
) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('PUT', uploadUrl)
    request.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
    request.upload.addEventListener('progress', (event) =>
      onProgress(event.loaded, event.lengthComputable ? event.total : file.size),
    )
    request.addEventListener('error', () => reject(new Error(`Network error while uploading ${file.name}.`)))
    request.addEventListener('abort', () => reject(new Error(`${file.name} upload was cancelled.`)))
    request.addEventListener('load', () => {
      let body: Record<string, unknown> = {}
      try {
        body = request.responseText ? (JSON.parse(request.responseText) as Record<string, unknown>) : {}
      } catch {
        body = {}
      }
      if (request.status >= 200 && request.status < 300 && body.id) resolve(body)
      else {
        const error = body.error as { message?: string } | undefined
        reject(new Error(error?.message || `Google Drive rejected ${file.name}.`))
      }
    })
    request.send(file)
  })
}

export async function uploadDetectedBatch(
  batch: DetectedBatchFolder,
  options: {
    failedOnly?: boolean
    onProgress: (progress: UploadProgress) => void
    onResult?: (result: UploadResult) => void
  },
) {
  const batchId = batch.manifest.batch_id
  const detailResponse = await fetch(`/api/editor-workflow/batches/${encodeURIComponent(batchId)}`, {
    cache: 'no-store',
    credentials: 'include',
  })
  const detail = (await responseJson(detailResponse)) as {
    error?: string
    jobs?: Array<{ bookingId: string; status: string }>
  }
  if (!detailResponse.ok) throw new Error(String(detail.error || `Batch ${batchId} was not found.`))
  const jobStatus = new Map((detail.jobs || []).map((job) => [String(job.bookingId), job.status]))
  const unknown = batch.manifest.clients.find((client) => !jobStatus.has(String(client.booking_id)))
  if (unknown) throw new Error(`${unknown.customer_name || unknown.booking_id} is not part of ${batchId}.`)
  const allowedBookingIds = new Set(
    batch.manifest.clients
      .filter((client) => {
        const status = jobStatus.get(String(client.booking_id)) || ''
        return options.failedOnly ? status === 'UPLOAD_FAILED' : EDITABLE_STATUSES.has(status)
      })
      .map((client) => String(client.booking_id)),
  )
  if (!allowedBookingIds.size) {
    throw new Error(options.failedOnly ? 'This folder has no failed clients to retry.' : 'This batch has no clients ready for upload.')
  }
  const work = createUploadWork(batch, allowedBookingIds)
  const filesTotal = work.reduce((sum, item) => sum + item.edited.length, 0)
  const bytesTotal = work.reduce(
    (sum, item) => sum + item.edited.reduce((fileSum, upload) => fileSum + upload.file.size, 0),
    0,
  )
  let filesDone = 0
  let bytesDone = 0
  let clientsDone = 0
  const progress = (clientName = '', currentFile = '', fileLoaded = 0) =>
    options.onProgress({
      batchId,
      shootDate: batch.manifest.shoot_date,
      clientName,
      currentFile,
      clientsDone,
      clientsTotal: work.length,
      filesDone,
      filesTotal,
      bytesDone: Math.min(bytesTotal, bytesDone + fileLoaded),
      bytesTotal,
    })
  progress()

  const startResponse = await fetch(
    `/api/editor-workflow/batches/${encodeURIComponent(batchId)}/start-upload`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingIds: work.map((item) => item.client.booking_id) }),
    },
  )
  const start = await responseJson(startResponse)
  if (!startResponse.ok) throw new Error(String(start.error || 'Could not start the batch upload.'))
  const uploadJobId = String(start.uploadJobId)
  const results: UploadResult[] = []

  for (let clientIndex = 0; clientIndex < work.length; clientIndex += 1) {
    const item = work[clientIndex]
    const bookingId = String(item.client.booking_id)
    const customerName = String(item.client.customer_name || bookingId)
    let clientError = ''
    for (const upload of item.edited) {
      let uploadFileId = ''
      progress(customerName, upload.file.name)
      try {
        const checksum = await sha256(upload.file)
        const sessionResponse = await fetch(
          `/api/editor-workflow/batches/${encodeURIComponent(batchId)}/upload-session`,
          {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              uploadJobId,
              bookingId,
              relativePath: upload.relativePath,
              fileName: upload.file.name,
              mimeType: upload.file.type || 'application/octet-stream',
              fileSize: upload.file.size,
              checksum,
            }),
          },
        )
        const session = await responseJson(sessionResponse)
        if (!sessionResponse.ok) throw new Error(String(session.error || 'Could not start file upload.'))
        uploadFileId = String(session.uploadFileId)
        if (!session.duplicate) {
          const driveFile = await putDriveFile(String(session.uploadUrl), upload.file, (loaded) =>
            progress(customerName, upload.file.name, loaded),
          )
          const completeResponse = await fetch(
            `/api/editor-workflow/batches/${encodeURIComponent(batchId)}/complete-file`,
            {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                uploadJobId,
                uploadFileId,
                driveFileId: driveFile.id,
                mimeType: upload.file.type || 'application/octet-stream',
              }),
            },
          )
          const complete = await responseJson(completeResponse)
          if (!completeResponse.ok) throw new Error(String(complete.error || 'Could not register the uploaded file.'))
        }
      } catch (error) {
        clientError = error instanceof Error ? error.message : 'File upload failed.'
        if (uploadFileId) {
          await fetch(`/api/editor-workflow/batches/${encodeURIComponent(batchId)}/fail-file`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uploadJobId, uploadFileId, error: clientError }),
          }).catch(() => undefined)
        }
      } finally {
        filesDone += 1
        bytesDone += upload.file.size
        progress(customerName)
      }
    }

    let result: UploadResult
    try {
      const finalizeResponse = await fetch(
        `/api/editor-workflow/batches/${encodeURIComponent(batchId)}/finalize-client`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uploadJobId, bookingId }),
        },
      )
      const finalized = await responseJson(finalizeResponse)
      if (!finalizeResponse.ok) throw new Error(String(finalized.error || 'Client validation failed.'))
      result = finalized as unknown as UploadResult
    } catch (error) {
      result = {
        bookingId,
        customerName,
        status: 'UPLOAD_FAILED',
        expected: Number(item.client.expected_output_count || 0),
        uploaded: 0,
        error: clientError || (error instanceof Error ? error.message : 'Upload failed.'),
      }
    }
    results.push(result)
    options.onResult?.(result)
    clientsDone = clientIndex + 1
    progress(customerName)
  }

  const finalizeResponse = await fetch(
    `/api/editor-workflow/batches/${encodeURIComponent(batchId)}/finalize-upload`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uploadJobId }),
    },
  )
  const summary = await responseJson(finalizeResponse)
  if (!finalizeResponse.ok) throw new Error(String(summary.error || 'Could not finalize the batch upload.'))
  return { summary: summary as unknown as BatchUploadSummary, results }
}
