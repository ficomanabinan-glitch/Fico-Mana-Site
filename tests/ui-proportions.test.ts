import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const source = (path: string) => readFileSync(path, 'utf8')

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
