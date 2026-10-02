import assert from 'node:assert/strict'
import test from 'node:test'
import {
  clearManagedPackageCache,
  fetchManagedPackages,
  getCachedManagedPackages,
  type ManagedPackage,
} from '../lib/package-manager-cache.ts'
import {
  clearSalesReadCache,
  fetchSales,
  getCachedSales,
} from '../lib/sales-read-cache.ts'

const packageRecord: ManagedPackage = {
  id: 'synthetic-service-contract', category: 'self-portrait', title: 'Synthetic package',
  price: '₱1,500', priceAmount: 1500, features: [], slotType: 'standard',
  selectionLimit: 5, isActive: true, sortOrder: 10,
}

test('malformed successful package envelopes reject instead of becoming a cached empty catalog', async t => {
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch; clearManagedPackageCache() })
  for (const body of [{}, { packages: [] }, null, 'unavailable']) {
    clearManagedPackageCache()
    globalThis.fetch = async () => Response.json(body)
    await assert.rejects(fetchManagedPackages(), /package catalog.*invalid/i)
    assert.equal(getCachedManagedPackages(), null)
  }
})

test('a malformed forced package refresh preserves the last successful catalog and permits a retry', async t => {
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch; clearManagedPackageCache() })
  clearManagedPackageCache()
  globalThis.fetch = async () => Response.json([packageRecord])
  const initial = await fetchManagedPackages()
  globalThis.fetch = async () => Response.json({})
  await assert.rejects(fetchManagedPackages({ force: true }), /package catalog.*invalid/i)
  assert.equal(getCachedManagedPackages(), initial)
  globalThis.fetch = async () => Response.json([])
  assert.deepEqual(await fetchManagedPackages({ force: true }), [])
  assert.deepEqual(getCachedManagedPackages(), [])
})

test('malformed successful sales envelopes reject before entering the report cache', async t => {
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch; clearSalesReadCache() })
  for (const body of [{}, null, [], { summary: [], settings: {} }, { summary: {}, settings: null }]) {
    clearSalesReadCache()
    globalThis.fetch = async () => Response.json(body)
    await assert.rejects(fetchSales('month', '2026-10-01'), /sales data.*invalid/i)
    assert.equal(getCachedSales('month', '2026-10-01'), null)
  }
})

test('a malformed sales refresh preserves its previous report and permits the next read', async t => {
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch; clearSalesReadCache() })
  clearSalesReadCache()
  // This is an envelope/cache contract test, not a financial calculation fixture.
  const envelope = { summary: {}, settings: {} }
  globalThis.fetch = async () => Response.json(envelope)
  const initial = await fetchSales('month', '2026-10-01')
  globalThis.fetch = async () => Response.json({ summary: {} })
  await assert.rejects(fetchSales('month', '2026-10-01', { force: true }), /sales data.*invalid/i)
  assert.equal(getCachedSales('month', '2026-10-01'), initial)
  globalThis.fetch = async () => Response.json(envelope)
  assert.deepEqual(await fetchSales('month', '2026-10-01', { force: true }), envelope)
})
