import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const source = (path: string) => readFileSync(path, 'utf8')

test('desktop thumbnails preview without selecting and keep mobile selection separate', () => {
  const gallery = source('components/client-photo-selection.tsx')
  const button = source('components/portal-photo-preview.tsx')
  assert.match(gallery, /onDesktopPreview=\{\(\) => setActiveFileId\(file.id\)\}/)
  assert.match(button, /onDesktopPreview\(file\); return/)
  assert.match(button, /min-width: 48rem/)
  assert.match(gallery, /top-2 flex md:hidden size-11/)
  assert.match(gallery, /xl:grid-cols-5/)
})

test('zoom preview reserves image space and exposes accessible loading and failure states', () => {
  const preview = source('components/portal-photo-preview.tsx')
  assert.match(preview, /relative h-\[65dvh\]/)
  assert.match(preview, /aria-busy=\{!loaded && !failed\}/)
  assert.match(preview, /Loading photo preview/)
  assert.match(preview, /motion-safe:animate-pulse/)
  assert.match(preview, /setLoaded\(true\)/)
  assert.match(preview, /role="alert"/)
  const gallery = source('components/client-photo-selection.tsx')
  assert.match(gallery, /grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5/)
  assert.doesNotMatch(gallery, /auto-fill|min-\[1920px\]:grid-cols-8/)
})

test('client identity stays editorial while secondary project context is progressively disclosed in Overview', () => {
  const portal = source('app/portal/[id]/page.tsx')
  const sidebar = source('components/portal-sidebar.tsx')
  assert.match(portal, /className="portal-brand-label">FICO MANA<\/p>/)
  assert.match(portal, /className="portal-client-name">\{data\.booking\.customerName\}<\/h1>/)
  assert.match(portal, /<PortalSidebar remaining=\{money\(payment\.remaining\)\}>/)
  assert.doesNotMatch(portal, /sidebarCollapsed/)
  assert.match(sidebar, />Overview<\//)
  assert.match(sidebar, /side="right"/)
  assert.match(sidebar, /Project information/)
  assert.doesNotMatch(portal, /This unique link exposes/)
})

test('client portal statuses are rounded badges without pretending to be action buttons', () => {
  const portals = source('app/admin/provisioning/page.tsx')
  assert.match(portals, /<p className="flex items-center gap-2 whitespace-nowrap">/)
  assert.match(portals, /<span className=\{`inline-flex rounded-md border px-2 py-1 text-caption font-semibold capitalize/)
  assert.match(portals, />\{item\.portal\.status\}<\/span>\{item\.portal\.expiresAt\?/)
  assert.doesNotMatch(portals, /item\.portal\.expiresAt\?<span className="mt-1 block/)
  assert.match(portals, /inline-flex rounded-md border px-2 py-1 text-caption font-semibold uppercase \$\{statusClass/)
})

test('all three client portal summary cards use the shared rounded card style', () => {
  const portals = source('app/admin/provisioning/page.tsx')
  const metric = portals.slice(portals.indexOf('function Metric('), portals.indexOf('function PortalQrDialog('))
  assert.match(metric, /className="rounded-card border border-white\/10 bg-white\/\[0\.02\] p-5"/)
  assert.equal((portals.match(/<Metric label=/g) || []).length, 3)
})

test('Open Folder uses the existing button wrapper and keeps direct new-tab navigation', () => {
  const portals = source('app/admin/provisioning/page.tsx')
  assert.match(portals, /<a href=\{item\.driveClientFolderUrl\} target="_blank" rel="noopener noreferrer" className=\{`\$\{actionButton\} min-h-10 whitespace-nowrap text-green-300`\}>Open folder/)
})

test('sales insight cards use the same rounded corners as other dashboard metrics', () => {
  const sales = source('app/admin/sales/page.tsx')
  const insight = sales.slice(sales.indexOf('function Insight('), sales.indexOf('function ExpenseBar('))
  assert.match(insight, /className="rounded-control border border-white\/\[0\.07\] bg-black\/10 p-3"/)
  assert.equal((sales.match(/<Insight label=/g) || []).length, 8)
})

test('queue sections have real grid gaps and rounded metrics without changing filter behavior', () => {
  const queue = source('components/editor-queue.tsx')
  assert.match(queue, /adminPanel\} grid min-w-0 gap-4 p-4/)
  assert.match(queue, /<label className="grid min-w-0 gap-2">/)
  assert.match(queue, /rounded-control border border-white\/\[0\.07\] bg-black\/10 p-3/)
  assert.match(queue, /rounded-control border border-\[#C4CEFF\]\/15/)
  assert.match(queue, /flex min-w-0 flex-wrap items-center/)
  assert.match(queue, /2xl:grid-cols-\[minmax\(16rem,1fr\)_auto\]/)
  assert.match(source('components/editor-page-skeleton.tsx'), /grid grid-cols-2 gap-3 p-4 sm:grid-cols-4 xl:grid-cols-7/)
})

test('booking panels and quick actions share the established corner tokens', () => {
  const bookings = source('app/admin/bookings/page.tsx')
  assert.match(bookings, /rounded-card border border-white\/10 bg-white\/\[0\.02\] overflow-x-auto/)
  assert.match(bookings, /rounded-card border border-white\/10 p-4 space-y-3/)
  for (const color of ['bg-amber-600', 'bg-primary', 'bg-green-600', 'bg-white/10', 'bg-red-600', 'bg-red-950/80']) {
    assert.ok(bookings.includes(`className="rounded-control ${color} hover:`), color)
  }
  assert.equal((source('components/admin-receipt-actions.tsx').match(/rounded-control/g) || []).length, 2)
})

test('shared typography remains responsive while client portal uses golden ratio only as a soft composition guide', () => {
  const css = source('app/globals.css')
  for (const [name, value] of Object.entries({ caption: '0.75rem', small: '0.875rem', body: '1rem', large: '1.125rem', 'card-title': '1.25rem', h3: '1.5rem' })) {
    assert.ok(css.includes(`--fico-text-${name}: ${value};`))
  }
  assert.match(css, /--fico-text-page-title: clamp\([^;]+2\.5rem\)/)
  assert.match(css, /--fico-text-display: clamp\([^;]+3\.25rem\)/)
  assert.match(css, /--tracking-label: 0\.06em/)
  assert.match(css, /--radius-card: var\(--fico-radius-card\)/)
  assert.match(source('lib/admin-ui.ts'), /text-page-title font-semibold/)

  const portalCss = source('app/portal/portal-final.css')
  assert.match(portalCss, /--portal-phi: 1\.618/)
  assert.match(portalCss, /grid-template-columns: minmax\(0, 1\.618fr\) minmax\(18rem, 1fr\)/)
  for (const px of ['8', '13', '21', '34', '55', '89']) assert.ok(portalCss.includes(`/* ${px} */`))
})

test('final photo layout uses an editorial desktop split and a merged compact sticky system on mobile', () => {
  const portal = source('app/portal/[id]/page.tsx')
  const selection = source('components/client-photo-selection.tsx')
  const sidebar = source('components/portal-sidebar.tsx')
  const portalCss = source('app/portal/portal-final.css')

  assert.doesNotMatch(portal, /max-w-\[1760px\]|sidebarCollapsed/)
  assert.match(portal, /new IntersectionObserver/)
  assert.match(portal, /portal-header-compact/)
  assert.match(portal, /portal-editorial-header/)
  assert.match(portal, /portal-selection-count/)
  assert.match(portal, />Shoot Day</)
  assert.doesNotMatch(portal, />Session</)
  assert.match(portal, /portal-workflow/)

  assert.match(portalCss, /Golden-ratio desktop split/)
  assert.match(portalCss, /grid-template-columns: minmax\(0, 1\.618fr\) minmax\(18rem, 1fr\)/)
  assert.match(portalCss, /\.portal-header-compact \.portal-project-id/)
  assert.match(portalCss, /\.portal-selection-steps \{/)
  assert.match(portalCss, /top: calc\(var\(--portal-mobile-header-height\) \+ env\(safe-area-inset-top, 0px\)\)/)

  assert.match(selection, /xl:grid-cols-5/)
  assert.match(selection, /aria-current=\{step === item\.id \? 'step' : undefined\}/)
  assert.match(sidebar, /side="right"/)
  assert.doesNotMatch(sidebar, /<aside|side="bottom"|xl:hidden/)
  assert.match(source('lib/admin-ui.ts'), /adminPage = 'w-full min-w-0/)
  assert.match(source('lib/admin-ui.ts'), /fico-table overflow-x-auto/)
})

test('operational metadata uses shared readable tokens, and requested filler labels stay removed', () => {
  for (const path of ['components/client-photo-selection.tsx', 'components/onsite-upload.tsx', 'components/editor-queue.tsx', 'components/filtering-dashboard.tsx', 'app/admin/provisioning/page.tsx', 'components/dashboard-sidebar.tsx']) {
    const text = source(path)
    assert.doesNotMatch(text, /text-\[(8|9|10|11)px\]/, path)
    assert.match(text, /text-caption/, path)
  }
  for (const path of ['app/admin/layout.tsx', 'components/editor-portal-shell.tsx']) assert.doesNotMatch(source(path), /Secure production workspace/)
  assert.doesNotMatch(source('components/client-photo-selection.tsx'), /Uses global preference/)
})

test('onsite mobile details stack and action buttons have equal columns and touch height', () => {
  const component = source('components/onsite-upload.tsx')
  assert.match(component, /<dl className="grid gap-2 text-small/)
  assert.match(component, /lg:grid-cols-\[minmax\(0,1fr\)_minmax\(0,1fr\)\]/)
  assert.match(component, /<dt>Uploaded files<\/dt>/)
  assert.match(component, /<dt>Last upload<\/dt>/)
  assert.match(component, /className="onsite-actions"/)
  assert.match(component, /AlertTriangle className="mt-0\.5 size-4 shrink-0"/)
  const css = source('app/globals.css')
  assert.match(css, /\.onsite-actions \{[^}]*repeat\(2, minmax\(0, 1fr\)\)/)
  assert.match(css, /\.onsite-actions > button \{[^}]*min-height: 3rem/)
})
