import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const source = (path: string) => readFileSync(path, 'utf8')

test('queue sections have real grid gaps and rounded metrics without changing filter behavior', () => {
  const queue = source('components/editor-queue.tsx')
  assert.match(queue, /adminPanel\} grid min-w-0 gap-4 p-4/)
  assert.match(queue, /<label className="grid min-w-0 gap-2">/)
  assert.match(queue, /rounded-control border border-white\/\[0\.07\] bg-black\/10 p-3/)
  assert.match(queue, /rounded-control border border-\[#C4CEFF\]\/15/)
  assert.match(queue, /flex min-w-0 flex-wrap items-center/)
  assert.match(queue, /2xl:grid-cols-\[minmax\(16rem,1fr\)_auto_auto\]/)
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

test('photo layout uses a contextual desktop split and keeps mobile and operations unconstrained', () => {
  const css = source('app/globals.css')
  assert.match(css, /\.fico-portal-columns \{[^}]*grid-template-columns: minmax\(0, 1fr\)/)
  assert.match(css, /@media \(min-width: 1024px\) \{\s*\.fico-portal-columns/)
  assert.match(css, /minmax\(0, 1\.618fr\) minmax\(18rem, 1fr\)/)
  const portal = source('app/portal/[id]/page.tsx')
  assert.match(portal, /fico-portal-columns/)
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
  assert.match(component, /<dl className="mt-4 grid gap-3 text-small/)
  assert.match(component, /<dt>Uploaded files<\/dt>/)
  assert.match(component, /<dt>Last upload<\/dt>/)
  assert.match(component, /className="onsite-actions"/)
  assert.match(component, /AlertTriangle className="mt-0\.5 size-4 shrink-0"/)
  const css = source('app/globals.css')
  assert.match(css, /\.onsite-actions \{[^}]*repeat\(2, minmax\(0, 1fr\)\)/)
  assert.match(css, /\.onsite-actions > button \{[^}]*min-height: 3rem/)
})
