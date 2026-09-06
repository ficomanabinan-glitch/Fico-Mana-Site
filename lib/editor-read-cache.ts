export type EditorBatchClient = {
  bookingId: string
  clientId: string
  clientName: string
  packageName: string
  status: string
  selectedCount: number
}

export type EditorBatchSummary = {
  id: string
  workspaceId: string
  shootDate: string
  locationKey: string
  status: string
  totalClients: number
  totalSelectedPhotos: number
  counts: {
    waitingForSelection: number
    readyForEditing: number
    downloaded: number
    editing: number
    readyToUpload: number
    uploading: number
    delivered: number
    failed: number
  }
  clients: EditorBatchClient[]
  driveDayFolderUrl: string
}

export type EditorQueueUiState = {
  groupMode: 'day' | 'week' | 'month'
  dateSortOrder: 'asc' | 'desc'
  filter: 'ALL' | 'WAITING_FOR_SELECTION' | 'READY_FOR_EDITING' | 'EDITING' | 'READY_TO_UPLOAD' | 'DELIVERED' | 'UPLOAD_FAILED'
  search: string
  packageFilter: string
}

const CACHE_FRESH_MS = 30_000
const SYNC_FRESH_MS = 60_000

let batchCache: { data: EditorBatchSummary[]; cachedAt: number } | null = null
let batchRequest: Promise<EditorBatchSummary[]> | null = null
let synchronizedBatchRequest: Promise<EditorBatchSummary[]> | null = null
let lastSynchronizedAt = 0
let cacheGeneration = 0
let rememberedQueueUi: EditorQueueUiState = {
  groupMode: 'day',
  dateSortOrder: 'desc',
  filter: 'ALL',
  search: '',
  packageFilter: 'ALL',
}

export function getCachedEditorBatches() {
  return batchCache?.data ?? null
}

export function shouldSynchronizeEditorBatches() {
  return Date.now() - lastSynchronizedAt >= SYNC_FRESH_MS
}

export function getRememberedEditorQueueUi() {
  return rememberedQueueUi
}

export function rememberEditorQueueUi(state: EditorQueueUiState) {
  rememberedQueueUi = state
}

export async function fetchEditorBatches({
  force = false,
  synchronize = false,
}: {
  force?: boolean
  synchronize?: boolean
} = {}) {
  if (
    !synchronize &&
    !force &&
    batchCache &&
    Date.now() - batchCache.cachedAt < CACHE_FRESH_MS
  ) {
    return batchCache.data
  }

  const activeRequest = synchronize ? synchronizedBatchRequest : batchRequest
  if (activeRequest) return activeRequest

  const requestGeneration = cacheGeneration
  const request = fetch(`/api/editor-workflow/batches${synchronize ? '?sync=1' : ''}`, {
    cache: 'no-store',
    credentials: 'include',
  }).then(async (response) => {
    const body = (await response.json().catch(() => [])) as EditorBatchSummary[] & { error?: string }
    if (!response.ok) {
      throw new Error(body.error || 'Could not load editor batches.')
    }
    const data = Array.isArray(body) ? body : []
    if (requestGeneration === cacheGeneration) {
      batchCache = { data, cachedAt: Date.now() }
      if (synchronize) lastSynchronizedAt = Date.now()
    }
    return data
  })

  if (synchronize) synchronizedBatchRequest = request
  else batchRequest = request

  try {
    return await request
  } finally {
    if (synchronize) synchronizedBatchRequest = null
    else batchRequest = null
  }
}

export function invalidateEditorBatchCache() {
  cacheGeneration += 1
  if (batchCache) batchCache = { ...batchCache, cachedAt: 0 }
  batchCache = null
  batchRequest = null
  synchronizedBatchRequest = null
  lastSynchronizedAt = 0
  rememberedQueueUi = {
    groupMode: 'day',
    dateSortOrder: 'desc',
    filter: 'ALL',
    search: '',
    packageFilter: 'ALL',
  }
}
