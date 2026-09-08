import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const source = (path: string) => readFileSync(path, 'utf8')

test('client identity remains compact while all contextual panels use rounded cards', () => {
  const portal = source('app/portal/[id]/page.tsx')
  assert.match(portal, /FICO MANA Client Portal<\/p><h1[^>]*>\{data\.booking\.customerName\}<\/h1>/)
  assert.match(portal, /rounded-card border border-white\/10 bg-white\/\[0\.025\] p-4/)
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

test('shared typography is rounded and responsive without a forced phi multiplier', () => {
  const css = source('app/globals.css')
  for (const [name, value] of Object.entries({caption:'0.75rem',small:'0.875rem',body:'1rem',large:'1.125rem','card-title':'1.25rem',h3:'1.5rem'})) {
    assert.ok(css.includes(`--fico-text-${name}: ${value};`))
  }
  assert.match(css, /--fico-text-page-title: clamp\([^;]+2\.5rem\)/)
  assert.match(css, /--fico-text-display: clamp\([^;]+3\.25rem\)/)
  assert.match(css, /--tracking-label: 0\.06em/)
  assert.match(css, /--radius-card: var\(--fico-radius-card\)/)
  assert.match(source('lib/admin-ui.ts'), /text-page-title font-semibold/)
})

test('photo layout uses the requested desktop, tablet, and mobile hierarchy', () => {
  const portal = source('app/portal/[id]/page.tsx')
  const selection = source('components/client-photo-selection.tsx')
  const sidebar = source('components/portal-sidebar.tsx')
  assert.doesNotMatch(portal, /max-w-\[1760px\]/)
  assert.match(portal, /xl:grid-cols-\[minmax\(250px,300px\)_minmax\(0,1fr\)\]/)
  assert.match(portal, /2xl:grid-cols-\[minmax\(280px,340px\)_minmax\(0,1fr\)\]/)
  assert.match(selection, /md:grid-cols-\[minmax\(0,1fr\)_minmax\(240px,300px\)\]/)
  assert.match(selection, /xl:grid-cols-\[minmax\(0,1fr\)_minmax\(270px,340px\)\]/)
  assert.match(selection, /2xl:grid-cols-\[minmax\(0,1fr\)_minmax\(320px,380px\)\]/)
  assert.match(selection, /2xl:grid-cols-\[repeat\(auto-fill,minmax\(175px,1fr\)\)\]/)
  assert.match(selection, /sticky top-4 hidden min-w-0 overflow-hidden rounded-card[^>]+md:block/)
  assert.match(sidebar, /xl:hidden/)
  assert.match(sidebar, /side="bottom"/)
  assert.doesNotMatch(portal, /lg:col-span-2/)
  assert.match(source('lib/admin-ui.ts'), /adminPage = 'w-full min-w-0/)
  assert.match(source('lib/admin-ui.ts'), /fico-table overflow-x-auto/)
})

test('operational metadata uses shared readable tokens, and requested filler labels stay removed', () => {
  for (const path of ['components/client-photo-selection.tsx','components/onsite-upload.tsx','components/editor-queue.tsx','components/filtering-dashboard.tsx','app/admin/provisioning/page.tsx','components/dashboard-sidebar.tsx']) {
    const text = source(path)
    assert.doesNotMatch(text, /text-\[(8|9|10|11)px\]/, path)
    assert.match(text, /text-caption/, path)
  }
  for (const path of ['app/admin/layout.tsx','components/editor-portal-shell.tsx']) assert.doesNotMatch(source(path), /Secure production workspace/)
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
