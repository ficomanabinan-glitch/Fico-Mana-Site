import assert from 'node:assert/strict'
import test from 'node:test'
import {
  clearSalesReadCache,
  fetchSales,
  getCachedSales,
  getRememberedSalesView,
  rememberSalesView,
  type SalesSummaryPayload,
} from '../lib/sales-read-cache.ts'
import {
  clearManagedPackageCache,
  fetchManagedPackages,
  getCachedManagedPackages,
  getRememberedPackageManagerUi,
  rememberManagedPackage,
  rememberPackageManagerUi,
  type ManagedPackage,
} from '../lib/package-manager-cache.ts'
import {
  fetchEditorBatches,
  getCachedEditorBatches,
  getRememberedEditorQueueUi,
  invalidateEditorBatchCache,
  rememberEditorQueueUi,
  type EditorBatchSummary,
} from '../lib/editor-read-cache.ts'

const salesPayload = {
  summary: {},
  settings: {
    monthlyRevenueTarget: 50_000,
    desiredMonthlyProfit: 20_000,
    desiredProfitMargin: 30,
  },
} as unknown as SalesSummaryPayload

const managedPackage: ManagedPackage = {
  id: 'fico-cache-test',
  category: 'self-portrait',
  title: 'FICO Cache Test',
  price: '₱1,500',
  priceAmount: 1500,
  features: ['Five enhanced photos'],
  slotType: 'standard',
  selectionLimit: 5,
  isActive: true,
  sortOrder: 10,
}

const editorBatch = {
  id: '2026-09-07-test',
  workspaceId: 'workspace-test',
  shootDate: '2026-09-07',
  locationKey: 'test',
  status: 'READY_FOR_EDITING',
  totalClients: 1,
  totalSelectedPhotos: 10,
  counts: {
    waitingForSelection: 0,
    readyForEditing: 1,
    downloaded: 0,
    editing: 0,
    readyToUpload: 0,
    uploading: 0,
    delivered: 0,
    failed: 0,
  },
  clients: [],
  storageReady: true,
} satisfies EditorBatchSummary

test('Sales cache reuses a fresh dataset and preserves the selected view', async (context) => {
  const originalFetch = globalThis.fetch
  context.after(() => {
    globalThis.fetch = originalFetch
    clearSalesReadCache()
  })
  clearSalesReadCache()
  let requests = 0
  globalThis.fetch = async () => {
    requests += 1
    return Response.json(salesPayload)
  }

  const first = await fetchSales('month', '2026-09-07')
  const second = await fetchSales('month', '2026-09-07')
  rememberSalesView('quarter', '2026-08-01')

  assert.deepEqual(first, salesPayload)
  assert.equal(second, first)
  assert.equal(requests, 1)
  assert.equal(getCachedSales('month', '2026-09-07'), first)
  assert.deepEqual(getRememberedSalesView(), { period: 'quarter', anchor: '2026-08-01' })

  await fetchSales('month', '2026-09-07', { force: true })
  assert.equal(requests, 2)
})

test('Package cache reuses package cards and applies mutation responses without a list refetch', async (context) => {
  const originalFetch = globalThis.fetch
  context.after(() => {
    globalThis.fetch = originalFetch
    clearManagedPackageCache()
  })
  clearManagedPackageCache()
  let requests = 0
  globalThis.fetch = async () => {
    requests += 1
    return Response.json([managedPackage])
  }

  await fetchManagedPackages()
  await fetchManagedPackages()
  rememberPackageManagerUi({ search: 'cache', category: 'self-portrait' })

  assert.equal(requests, 1)
  assert.deepEqual(getCachedManagedPackages(), [managedPackage])
  assert.deepEqual(getRememberedPackageManagerUi(), {
    search: 'cache',
    category: 'self-portrait',
  })

  const updated = { ...managedPackage, price: '₱1,800', priceAmount: 1800 }
  assert.deepEqual(rememberManagedPackage(updated), [updated])
  assert.equal(requests, 1)

  await fetchManagedPackages({ force: true })
  assert.equal(requests, 2)
})

test('Editor queue reuses fresh batches and preserves its filters between routes', async (context) => {
  const originalFetch = globalThis.fetch
  context.after(() => {
    globalThis.fetch = originalFetch
    invalidateEditorBatchCache(true)
  })
  invalidateEditorBatchCache(true)
  let requests = 0
  globalThis.fetch = async () => {
    requests += 1
    return Response.json([editorBatch])
  }

  const first = await fetchEditorBatches()
  const second = await fetchEditorBatches()
  rememberEditorQueueUi({
    groupMode: 'week',
    dateSortOrder: 'asc',
    filter: 'READY_FOR_EDITING',
    search: 'sample client',
    packageFilter: 'Wedding',
  })

  assert.deepEqual(first, [editorBatch])
  assert.equal(second, first)
  assert.equal(requests, 1)
  assert.equal(getCachedEditorBatches(), first)
  assert.deepEqual(getRememberedEditorQueueUi(), {
    groupMode: 'week',
    dateSortOrder: 'asc',
    filter: 'READY_FOR_EDITING',
    search: 'sample client',
    packageFilter: 'Wedding',
  })

  await fetchEditorBatches({ force: true })
  assert.equal(requests, 2)
})
