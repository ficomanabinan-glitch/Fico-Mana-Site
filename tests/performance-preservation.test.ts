import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Calendar } from 'lucide-react'
import { loadTs } from './helpers/load-ts.ts'
import * as sales from '../lib/sales-read-cache.ts'
import * as packages from '../lib/package-manager-cache.ts'
import * as editor from '../lib/editor-read-cache.ts'
import { adminPage } from '../lib/admin-ui.ts'

test('original consoles use full-width main content while preserving sidebars and gutters', () => {
  assert.match(adminPage, /\bw-full\b/)
  assert.match(adminPage, /\bmin-w-0\b/)
  assert.doesNotMatch(adminPage, /max-w-/)
  for (const file of ['app/admin/layout.tsx', 'components/editor-portal-shell.tsx']) {
    const source = readFileSync(file, 'utf8')
    assert.match(source, /<main[^>]+min-w-0 w-full[^>]+p-5 md:p-8/)
    assert.match(source, /w-\[260px\]/)
  }
})

for (const kind of ['sales', 'packages', 'editor', 'editor-sync'] as const) {
  test(`${kind}: an old request cannot clear a newer request after invalidation`, async t => {
    const originalFetch = globalThis.fetch
    const pending: Array<(response: Response) => void> = []
    const clear = kind === 'sales' ? sales.clearSalesReadCache : kind === 'packages' ? packages.clearManagedPackageCache : () => editor.invalidateEditorBatchCache(true)
    const read = () => kind === 'sales' ? sales.fetchSales('month', '2026-09-07', { force: true }) :
      kind === 'packages' ? packages.fetchManagedPackages({ force: true }) :
      editor.fetchEditorBatches({ force: true, synchronize: kind === 'editor-sync' })
    t.after(() => { globalThis.fetch = originalFetch; clear() })
    clear()
    globalThis.fetch = () => new Promise<Response>(resolve => pending.push(resolve))
    const first = read()
    clear()
    const second = read()
    pending[0](Response.json(kind === 'sales' ? { summary: {}, settings: {} } : []))
    await first
    const third = read()
    assert.equal(pending.length, 2, 'third caller joins the current request instead of sending a duplicate')
    pending[1](Response.json(kind === 'sales' ? { summary: {}, settings: {} } : []))
    assert.deepEqual(await second, await third)
  })
}

test('an older package refresh cannot overwrite an acknowledged package edit', async t => {
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch; packages.clearManagedPackageCache() })
  packages.clearManagedPackageCache()
  let resolve!: (response: Response) => void
  globalThis.fetch = () => new Promise<Response>(done => { resolve = done })
  const read = packages.fetchManagedPackages()
  const updated = { id: 'synthetic-package', title: 'Sample', sortOrder: 1, priceAmount: 1800 } as packages.ManagedPackage
  packages.rememberManagedPackage(updated)
  resolve(Response.json([{ ...updated, priceAmount: 1500 }]))
  assert.deepEqual(await read, [updated])
  assert.deepEqual(packages.getCachedManagedPackages(), [updated])
})

test('sidebar structure, links and states are preserved with the approved typography tokens', () => {
  const path = 'components/dashboard-sidebar.tsx'
  const baseline = readFileSync('tests/fixtures/sidebar-before-performance.tsx', 'utf8')
    .replace(/text-\[(?:8|9|10|11)px\]/g, 'text-caption')
    .replace(/tracking-\[0\.22em\]/g, 'tracking-label')
    .replace(/text-caption font-bold/g, 'text-caption font-semibold')
  const stubs = {
    'next/link': ({ href, className, children, ...props }: Record<string, unknown>) => createElement('a', { href: String(href), className: String(className), 'aria-current': props['aria-current'] as 'page' }, children as never),
    'next/navigation': { useRouter: () => ({ prefetch() {} }) },
    '@/lib/admin-ui': { adminNavActive: 'active-token', adminNavIdle: 'idle-token' },
  }
  type Module = typeof import('../components/dashboard-sidebar.tsx')
  const before = loadTs<Module>(path, stubs, baseline)
  const after = loadTs<Module>(path, stubs)
  for (const mobile of [false, true]) {
    for (const activePath of ['/admin/dashboard', '/admin/provisioning/client']) {
      const props = { mobile, activePath, onNavigate() {}, sections: [
        { label: 'Overview', items: [{ label: 'Dashboard', href: '/admin/dashboard', icon: Calendar, exact: true }] },
        { label: 'Clients', items: [{ label: 'Portals', href: '/admin/provisioning', icon: Calendar, badge: 2 }, { label: 'Editor', href: 'https://editor.ficomana.com', icon: Calendar }] },
      ] }
      const polished = renderToStaticMarkup(createElement(after.DashboardSidebarNavigation, props))
      assert.match(polished, /aria-label="Workspace navigation"/)
      assert.equal(polished.replace(' aria-label="Workspace navigation"', ''), renderToStaticMarkup(createElement(before.DashboardSidebarNavigation, props)))
    }
  }
})
