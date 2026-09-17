import { STAFF_BACKGROUND_SYNC_MIN_MS, STAFF_READ_FRESH_MS } from './admin-cache-policy.ts'

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
  storageReady: boolean
}

export type EditorQueueUiState = {
  groupMode: 'day' | 'week' | 'month'
  dateSortOrder: 'asc' | 'desc'
  filter: 'ALL' | 'WAITING_FOR_SELECTION' | 'READY_FOR_EDITING' | 'DOWNLOADED' | 'DELIVERED' | 'UPLOAD_FAILED'
  search: string
  packageFilter: string
}

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
  return Date.now() - lastSynchronizedAt >= STAFF_BACKGROUND_SYNC_MIN_MS
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
    Date.now() - batchCache.cachedAt < STAFF_READ_FRESH_MS
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
    if (synchronize && synchronizedBatchRequest === request) synchronizedBatchRequest = null
    if (!synchronize && batchRequest === request) batchRequest = null
  }
}

export function invalidateEditorBatchCache(discardPrivateData = false) {
  cacheGeneration += 1
  // Mutations make the snapshot stale, not unusable. Keep it painted until the
  // replacement arrives; authentication changes pass discardData=true.
  if (batchCache) batchCache = { ...batchCache, cachedAt: 0 }
  batchRequest = null
  synchronizedBatchRequest = null
  lastSynchronizedAt = 0
  if (discardPrivateData) {
    batchCache = null
    rememberedQueueUi = {
      groupMode: 'day',
      dateSortOrder: 'desc',
      filter: 'ALL',
      search: '',
      packageFilter: 'ALL',
    }
  }
}
