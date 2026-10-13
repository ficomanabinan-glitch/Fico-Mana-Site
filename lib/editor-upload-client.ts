import { uploadWithPresignedPlan, type BrowserUploadPlan } from '@/lib/storage/browser-upload'

export type PickedUploadFile = {
  file: File
  relativePath: string
}

export type UploadManifestClient = {
  booking_id: string
  client_id?: string
  folder_name: string
  customer_name: string
  expected_output_count: number
}

export type BatchUploadManifest = {
  schema_version: number
  batch_id: string
  shoot_date: string
  clients: UploadManifestClient[]
  workspace_id?: string
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

export type PreflightClient = {
  bookingId: string
  customerName: string
  status: 'READY' | 'DELIVERED' | 'UPLOADING' | 'ATTENTION' | 'MISSING' | 'OTHER_BATCH' | 'INVALID'
  reason: string
  expectedFiles: number
  manifestIndex: number
  workflowStatus?: string
}
export type BatchPreflight = {
  clients: PreflightClient[]
  readyClients: number
  totalClients: number
  attentionClients: number
}

function safePath(value: string) {
  return Boolean(value) && !/^[\\/]|^[a-z]:/i.test(value) && !value.replace(/\\/g, '/').split('/').some((part) => !part || part === '.' || part === '..' || /[\u0000-\u001f]/.test(part))
}

function clientIssue(batch: DetectedBatchFolder, client: UploadManifestClient) {
  if (!client || typeof client.booking_id !== 'string' || !client.booking_id.trim()) return 'The manifest is missing a booking ID. Download this batch again.'
  if (client.client_id !== undefined && (typeof client.client_id !== 'string' || !client.client_id.trim())) return 'The manifest has an invalid client ID. Download this batch again.'
  if (typeof client.customer_name !== 'string' || !client.customer_name.trim()) return 'The manifest is missing the client name. Download this batch again.'
  if (!Number.isSafeInteger(client.expected_output_count) || client.expected_output_count < 0) return 'The manifest has an invalid expected photo count. Download this batch again.'
  if (typeof client.folder_name !== 'string' || !safePath(client.folder_name) || /[\\/:*?"<>|]/.test(client.folder_name) || /[. ]$/.test(client.folder_name)) return 'The client folder name is invalid. Download this batch again.'
  const duplicates = batch.manifest.clients.filter((other) => other && (other.booking_id === client.booking_id || (client.client_id && other.client_id === client.client_id) || (typeof other.folder_name === 'string' && other.folder_name.toLowerCase() === client.folder_name.toLowerCase())))
  if (duplicates.length > 1) return 'This client has a duplicate booking, client ID, or folder in the manifest. Download this batch again.'
  return ''
}

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
    manifest.schema_version === 1 &&
    typeof manifest.batch_id === 'string' && Boolean(manifest.batch_id.trim()) &&
    typeof manifest.shoot_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(manifest.shoot_date) &&
    (manifest.workspace_id === undefined || (typeof manifest.workspace_id === 'string' && Boolean(manifest.workspace_id.trim()))) &&
    Array.isArray(manifest.clients) && manifest.clients.length > 0
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
    if (!isBatchManifest(parsed)) {
      if (parsed && typeof parsed === 'object' && 'batch_id' in parsed) throw new Error('The batch manifest is invalid or uses an unsupported version. Download this batch again.')
      continue
    }
    if (!safePath(candidate.relativePath)) throw new Error('The batch folder contains an unsafe path. Select a freshly extracted batch folder.')
    const rootPath = parentPath(candidate.relativePath)
    const scopedFiles = files.filter((item) => {
      const path = normalizePath(item.relativePath)
      return !rootPath || path === rootPath || path.startsWith(`${rootPath}/`)
    })
    const previous = detected.findIndex((item) => item.manifest.batch_id === parsed.batch_id)
    const next = { manifest: parsed, manifestPath: candidate.relativePath, rootPath, files: scopedFiles }
    if (previous < 0) detected.push(next)
    else throw new Error(`More than one folder identifies batch ${parsed.batch_id}. Choose one batch folder at a time.`)
  }
  return detected.sort((a, b) => a.manifest.shoot_date.localeCompare(b.manifest.shoot_date))
}

export function createUploadWork(batch: DetectedBatchFolder, allowedBookingIds: Set<string>) {
  const work: UploadWork[] = []
  for (const client of batch.manifest.clients) {
    if (clientIssue(batch, client)) continue
    if (!allowedBookingIds.has(String(client.booking_id))) continue
    const edited = batch.files
      .map((item) => {
        if (!safePath(item.relativePath)) return null
        const path = normalizePath(item.relativePath)
        const prefix = batch.rootPath ? `${batch.rootPath}/` : ''
        if (prefix && !path.startsWith(prefix)) return null
        const parts = path.slice(prefix.length).split('/')
        if (parts[0]?.toLowerCase() !== client.folder_name.toLowerCase()) return null
        const afterClient = parts.slice(1)
        const firstFolder = afterClient.shift()?.toUpperCase()
        const editedFolder = firstFolder === 'SELECTED' ? afterClient.shift()?.toUpperCase() : firstFolder
        if (!['EDITED', 'EDITED PHOTOS', 'ENHANCED'].includes(editedFolder || '')) return null
        if (!afterClient.length || ['manifest.json', '.fico-client.json'].includes(item.file.name.toLowerCase())) return null
        const originalName = item.file.name
        const uploadName = /^ENHANCED - /i.test(originalName) ? originalName : `ENHANCED - ${originalName}`
        const file = uploadName === originalName
          ? item.file
          : new File([item.file], uploadName, { type: item.file.type, lastModified: item.file.lastModified })
        afterClient[afterClient.length - 1] = uploadName
        return { file, relativePath: `EDITED/${afterClient.join('/')}` }
      })
      .filter((item): item is { file: File; relativePath: string } => Boolean(item))
      .sort((a, b) => a.relativePath.localeCompare(b.relativePath, 'en', { numeric: true }))
    work.push({ client, edited })
  }
  return work
}

async function sha256(file: File) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function preflightDetectedBatch(batch: DetectedBatchFolder): Promise<BatchPreflight> {
  const work = createUploadWork(batch, new Set(batch.manifest.clients.map((client) => client?.booking_id)))
  const response = await fetch(`/api/editor-workflow/batches/${encodeURIComponent(batch.manifest.batch_id)}/preflight`, {
    method: 'POST', cache: 'no-store', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      workspaceId: batch.manifest.workspace_id,
      clients: batch.manifest.clients.map((client) => ({ bookingId: typeof client?.booking_id === 'string' ? client.booking_id : '', clientId: typeof client?.client_id === 'string' ? client.client_id : undefined, expectedFiles: work.find((item) => item.client === client)?.edited.length || 0 })),
    }),
  })
  const body = await responseJson(response)
  if (!response.ok) throw new Error(String(body.error || 'Could not verify this batch. Retry the folder check.'))
  if (!Array.isArray(body.clients) || body.clients.length !== batch.manifest.clients.length) throw new Error('The folder check did not return every client. Retry the folder check.')
  const statuses = new Set(['READY', 'DELIVERED', 'UPLOADING', 'ATTENTION', 'MISSING', 'OTHER_BATCH', 'INVALID'])
  const clients = batch.manifest.clients.map((client, manifestIndex): PreflightClient => {
    const server = (body.clients as Record<string, unknown>[])[manifestIndex]
    if (!server || server.bookingId !== (typeof client?.booking_id === 'string' ? client.booking_id : '') || !statuses.has(String(server.status)) || typeof server.reason !== 'string') throw new Error('The folder check returned an invalid client result. Retry the folder check.')
    const edited = work.find((item) => item.client === client)?.edited || []
    let reason = clientIssue(batch, client)
    const duplicateFiles = new Set(edited.map((item) => item.relativePath.toLowerCase())).size !== edited.length
    if (!reason && duplicateFiles) reason = 'Several edited files resolve to the same upload name. Keep one file for each photo and check the folder again.'
    const clientPrefix = `${batch.rootPath ? `${batch.rootPath}/` : ''}${client?.folder_name}/`.toLowerCase()
    if (!reason && batch.files.some((item) => !safePath(item.relativePath) && normalizePath(item.relativePath).toLowerCase().startsWith(clientPrefix))) reason = 'This client folder contains an unsafe file path. Choose a freshly extracted folder.'
    if (!reason && server.status === 'READY' && !edited.length) reason = 'No edited photos found. Save this client’s photos inside SELECTED/EDITED, then check the folder again.'
    return { bookingId: typeof client?.booking_id === 'string' ? client.booking_id : '', customerName: String(server.customerName || (typeof client?.customer_name === 'string' ? client.customer_name : 'Unnamed client')), status: reason ? 'ATTENTION' : server.status as PreflightClient['status'], reason: reason || server.reason, expectedFiles: edited.length, manifestIndex, workflowStatus: typeof server.workflowStatus === 'string' ? server.workflowStatus : '' }
  })
  return { clients, readyClients: clients.filter((client) => client.status === 'READY').length, totalClients: clients.length, attentionClients: clients.filter((client) => client.status !== 'READY' && client.status !== 'DELIVERED').length }
}

export async function uploadDetectedBatch(
  batch: DetectedBatchFolder,
  options: {
    confirmedBookingIds: string[]
    onPreflight?: (preflight: BatchPreflight) => void
    onProgress: (progress: UploadProgress) => void
    onResult?: (result: UploadResult) => void
  },
) {
  const batchId = batch.manifest.batch_id
  const checked = await preflightDetectedBatch(batch)
  const confirmed = new Set(options.confirmedBookingIds)
  const reviewedClients = checked.clients.map((client): PreflightClient => client.status === 'READY' && !confirmed.has(client.bookingId)
    ? { ...client, status: 'ATTENTION', reason: 'Not included in your confirmation. Check clients again to include this client in a new upload.' }
    : client)
  options.onPreflight?.({ ...checked, clients: reviewedClients, readyClients: reviewedClients.filter((client) => client.status === 'READY').length, attentionClients: reviewedClients.filter((client) => client.status !== 'READY' && client.status !== 'DELIVERED').length })
  const allowedBookingIds = new Set(checked.clients.filter((client) => client.status === 'READY' && confirmed.has(client.bookingId)).map((client) => client.bookingId))
  if (!allowedBookingIds.size) {
    const summary: BatchUploadSummary = { id: '', status: 'SKIPPED', totalClients: checked.totalClients, completedClients: 0, failedClients: 0, photosUploaded: 0, batchStatus: '', failedBookingIds: [] }
    return { summary, results: [] as UploadResult[], preflight: checked, skippedClients: checked.totalClients }
  }
  const work = createUploadWork(batch, allowedBookingIds)
  const emptyClient = work.find((item) => item.edited.length === 0)
  if (emptyClient) {
    throw new Error(`${emptyClient.client.customer_name || emptyClient.client.booking_id} has no photos inside its SELECTED/EDITED folder.`)
  }
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
      body: JSON.stringify({
        workspaceId: batch.manifest.workspace_id,
        clients: work.map((item) => ({
          bookingId: item.client.booking_id,
          clientId: item.client.client_id,
          expectedFiles: item.edited.length,
        })),
      }),
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
        const displayName = String(session.fileName || upload.file.name)
        progress(customerName, displayName)
        if (!session.duplicate) {
          if (!session.upload || typeof session.upload !== 'object' || typeof session.storageKey !== 'string') {
            throw new Error('The private upload permission was incomplete.')
          }
          const completion = await uploadWithPresignedPlan(
            upload.file,
            session.upload as BrowserUploadPlan,
            (loaded) => progress(customerName, displayName, loaded),
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
                storageKey: session.storageKey,
                mimeType: upload.file.type || 'application/octet-stream',
                ...completion,
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
        expected: item.edited.length,
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
  return { summary: summary as unknown as BatchUploadSummary, results, preflight: checked, skippedClients: checked.totalClients - work.length }
}
