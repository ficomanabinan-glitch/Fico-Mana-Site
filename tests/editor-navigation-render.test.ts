import assert from 'node:assert/strict'
import test from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { loadTs } from './helpers/load-ts.ts'

const link = ({ href, children, ...props }: any) => {
  delete props.prefetch
  return React.createElement('a', { ...props, href }, children)
}
const wrapper = ({ children }: any) => children
const unusedBoundary = () => { throw new Error('Render tests must not touch live services or writes.') }
const router = { push: unusedBoundary, replace: unusedBoundary, refresh: unusedBoundary, prefetch: unusedBoundary }
const navigation = loadTs<any>('components/dashboard-sidebar.tsx', {
  'next/link': link,
  'next/navigation': { useRouter: () => router },
  '@/lib/admin-ui': { adminNavActive: 'active', adminNavIdle: 'idle' },
})

function renderShell(capabilities: { edit: boolean; onsite: boolean; admin: boolean }, path: string, mobile = false) {
  const session = {
    user: { id: 'synthetic-editor', email: 'editor@example.test', displayName: 'Synthetic Editor' },
    workspace: { name: 'Synthetic Studio' },
    role: capabilities.admin ? 'admin' : capabilities.edit ? 'editor' : 'onsite', capabilities,
  }
  let state = 0
  const shell = loadTs<any>('components/editor-portal-shell.tsx', {
    react: { ...React, useEffect: () => {}, useLayoutEffect: () => {}, useState: () => [[session, false, mobile, null][state++], unusedBoundary] },
    'next/link': link,
    'next/navigation': { useRouter: () => router, usePathname: () => path },
    '@/components/dashboard-sidebar': navigation,
    '@/components/admin-toast-provider': { AdminToastProvider: wrapper },
    '@/components/workspace-refresh': { WorkspaceRefreshProvider: wrapper },
    '@/components/staff-query-provider': wrapper,
    '@/components/editor-page-skeleton': () => null,
    '@/components/client-workspace-return': () => null,
    '@/lib/editor-read-cache': { invalidateEditorBatchCache: unusedBoundary },
    '@/lib/staff-cache-session': { bindStaffReadCache: unusedBoundary },
  })
  return renderToStaticMarkup(React.createElement(shell.default, null, React.createElement('p', null, 'Synthetic page')))
}

function navBlocks(markup: string) { return [...markup.matchAll(/<nav\b[^>]*>([\s\S]*?)<\/nav>/g)].map(match => match[1]) }
function destinations(markup: string) { return [...markup.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map(match => match[1]) }
function activeDestinations(markup: string) {
  return [...markup.matchAll(/<a\b[^>]*>/g)]
    .filter(match => match[0].includes('aria-current="page"'))
    .map(match => /href="([^"]+)"/.exec(match[0])?.[1])
}

test('editor navigation renders all seven existing routes in lifecycle order and exact active state', () => {
  const markup = renderShell({ edit: true, onsite: true, admin: false }, '/editor/filtering')
  const [nav] = navBlocks(markup)
  assert.deepEqual(destinations(nav), ['/editor', '/editor/onsite', '/editor/filtering', '/editor/queue', '/editor/upload', '/editor/client-portals', '/editor/files'])
  for (const section of ['Overview', 'Originals &amp; selection', 'Editing', 'Delivery &amp; files']) assert.ok(nav.includes(`>${section}</p>`), section)
  assert.deepEqual(activeDestinations(nav), ['/editor/filtering'])
  assert.equal((nav.match(/aria-current="page"/g) ?? []).length, 1)
  assert.doesNotMatch(markup, /Open Admin Console/)
  assert.match(markup, />Client Selections<\/p>/)
})

test('onsite-only capability renders Dashboard and Onsite Upload without empty lifecycle groups', () => {
  const markup = renderShell({ edit: false, onsite: true, admin: false }, '/editor/onsite')
  const [nav] = navBlocks(markup)
  assert.deepEqual(destinations(nav), ['/editor', '/editor/onsite'])
  assert.doesNotMatch(nav, />Editing<\/p>|Delivery &amp; files|Client Selections/)
  assert.deepEqual(activeDestinations(nav), ['/editor/onsite'])
  assert.doesNotMatch(markup, /Open Admin Console/)
})

test('capabilities rather than role names control links and admin console remains admin-only', () => {
  const editor = navBlocks(renderShell({ edit: true, onsite: false, admin: false }, '/editor/queue/client'))[0]
  assert.equal(destinations(editor).length, 6)
  assert.doesNotMatch(editor, /Onsite Upload/)
  assert.deepEqual(activeDestinations(editor), ['/editor/queue'])
  assert.equal((editor.match(/aria-current="page"/g) ?? []).length, 1, 'Dashboard does not become active on a nested route')
  assert.match(renderShell({ edit: true, onsite: true, admin: true }, '/editor'), /href="https:\/\/admin\.ficomana\.com\/admin\/dashboard"/)
})

test('opened mobile navigation renders the same capability-filtered destinations and menu relationship', () => {
  for (const capabilities of [{ edit: false, onsite: true, admin: false }, { edit: true, onsite: true, admin: false }, { edit: true, onsite: true, admin: true }]) {
    const markup = renderShell(capabilities, '/editor/onsite', true)
    const [desktop, mobile] = navBlocks(markup)
    assert.deepEqual(destinations(mobile), destinations(desktop))
    assert.match(markup, /aria-label="Toggle navigation" aria-expanded="true" aria-controls="editor-mobile-navigation"/)
    assert.match(markup, /id="editor-mobile-navigation"/)
    assert.equal((markup.match(/Open Admin Console/g) ?? []).length, capabilities.admin ? 2 : 0)
  }
})

test('selection page renders Client Selections in editor context while retaining the admin heading', () => {
  for (const session of [null, { capabilities: { admin: false } }, { capabilities: { admin: true } }]) {
    const dashboard = loadTs<any>('components/filtering-dashboard.tsx', {
      react: { ...React, useEffect: () => {} },
      'next/link': link,
      '@/components/editor-portal-shell': { useEditorSession: () => session },
      '@/components/editor-queue': () => null,
      '@/lib/filtering-read-cache': { peekFilteringBookings: () => [], fetchFilteringBookings: unusedBoundary },
      '@/lib/booking-display': {},
      '@/lib/booking-priority': { sortBookingsByDayPriority: (items: unknown) => items },
      '@/lib/raw-photo-display': { countPendingRawPhotoReviews: () => 0, hasRawPhotoSubmission: () => false },
      '@/components/booking-priority-select': () => null,
      '@/lib/admin-ui': {},
      '@/components/admin-page-header': ({ title }: any) => React.createElement('h1', null, title),
      '@/components/admin-booking-calendar': () => null,
      '@/components/admin-raw-photo-queue': () => null,
      '@/components/use-cached-page-read': { usePageBackgroundSync: () => {} },
      '@/components/download-requests-panel': () => null,
      '@/components/use-booking-queue': { useBookingQueue: () => ({ priorityMap: new Map() }) },
    })
    const markup = renderToStaticMarkup(React.createElement(dashboard.default, { initialTab: 'queue' }))
    assert.match(markup, session ? /<h1>Client Selections<\/h1>/ : /<h1>Filtering Dashboard<\/h1>/)
  }
})
