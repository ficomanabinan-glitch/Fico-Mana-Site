import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { loadTs } from './helpers/load-ts.ts'

const blocked = () => { throw new Error('Synthetic render tests forbid service reads and writes.') }
const read = (path: string) => readFileSync(path, 'utf8')
const link = ({ href, children, ...props }: any) => {
  delete props.prefetch
  return React.createElement('a', { ...props, href }, children)
}
const motionDiv = ({ children, ...props }: any) => {
  for (const key of ['variants', 'initial', 'whileInView', 'viewport', 'transition']) delete props[key]
  return React.createElement('div', props, children)
}
const websiteContent = {
  studioName: 'Synthetic Studio', addressLine1: 'Synthetic Address', addressLine2: 'Synthetic City',
  phoneNumber: '+63 900 000 0000', mapEmbedUrl: 'https://example.test/map', mapDirectionsUrl: 'https://example.test/directions',
  copy: { footerNavigate: 'Navigate', footerFindUs: 'Find us', footerConnect: 'Connect', footerDirections: 'Directions',
    schoolsTitle: 'Partner Schools', partner1Name: 'Synthetic School One', partner2Name: 'Synthetic School Two' },
}

test('footer section labels render with the public text token and pass small-text contrast', () => {
  const Footer = loadTs<any>('components/footer.tsx', {
    'framer-motion': { motion: { div: motionDiv } },
    'next/link': link,
    'next/image': ({ alt }: any) => React.createElement('img', { alt }),
    '@/lib/website-content-client': { useWebsiteContent: () => websiteContent },
  }).default
  const markup = renderToStaticMarkup(React.createElement(Footer))
  const headings = [...markup.matchAll(/<h4 class="([^"]+)">([^<]+)<\/h4>/g)]
  assert.equal(headings.length, 4)
  assert.deepEqual(headings.map(match => match[2]), ['Navigate', 'Find us', 'Connect', 'Directions'])
  assert.ok(headings.every(match => match[1].includes('text-public-muted')))
  const css = read('app/globals.css')
  assert.match(css, /--color-public-muted:\s*var\(--fico-public-muted\)/)
  const alpha = Number(/--fico-public-muted:\s*rgb\(255 255 255 \/ ([\d.]+)\)/.exec(css)?.[1])
  const background = Number.parseInt(/--color-black:\s*#([\da-f]{2})\1\1/i.exec(css)?.[1] ?? '', 16)
  const linear = (channel: number) => { const c = channel / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
  const ratio = (linear(255 * alpha + background * (1 - alpha)) + 0.05) / (linear(background) + 0.05)
  assert.ok(ratio >= 4.5, `Footer labels require at least 4.5:1, received ${ratio}`)
})

test('partner school strip renders a named keyboard region with visible focus styling', () => {
  const Schools = loadTs<any>('components/school-affiliations.tsx', {
    'framer-motion': { motion: { div: motionDiv } },
    '@/lib/website-content-client': { useWebsiteContent: () => websiteContent },
    '@/components/section-header': () => null,
    '@/components/section-shell': ({ children }: any) => React.createElement('section', null, children),
  }).default
  const markup = renderToStaticMarkup(React.createElement(Schools))
  const region = /<div\b[^>]*role="region"[^>]*>/.exec(markup)?.[0] ?? ''
  assert.match(region, /aria-label="Partner Schools"/)
  assert.match(region, /tabindex="0"/)
  assert.match(region, /overflow-x-auto/)
  assert.match(region, /focus-visible:ring-2/)
  assert.match(region, /focus-visible:ring-\[var\(--fico-focus\)\]/)
  assert.ok(markup.includes('Synthetic School One') && markup.includes('Synthetic School Two'))
})

test('sidebar sign out target cannot shrink when synthetic profile text is long', () => {
  const { DashboardSidebarProfile } = loadTs<any>('components/dashboard-sidebar.tsx', {
    'next/link': link, 'next/navigation': { useRouter: blocked }, '@/lib/admin-ui': {},
  })
  const markup = renderToStaticMarkup(React.createElement(DashboardSidebarProfile, {
    label: 'Synthetic Long Staff Name With Several Words', detail: 'synthetic.long.staff@example.test', onLogout: blocked,
  }))
  const target = /<button\b[^>]*aria-label="Sign out"[^>]*>/.exec(markup)?.[0] ?? ''
  assert.match(target, /size-11/)
  assert.match(target, /shrink-0/)
})

function renderQueue(pathname: string, state: 'loaded' | 'loading' | 'failed') {
  let index = 0
  const Queue = loadTs<any>('components/editor-queue.tsx', {
    react: { ...React, useEffect: () => {}, useState: (initial: any) => {
      const position = index++
      let value = typeof initial === 'function' ? initial() : initial
      if (state === 'failed' && position === 1) value = false
      if (state === 'failed' && position === 8) value = 'Synthetic metadata read failed'
      return [value, blocked]
    } },
    'next/link': link,
    'next/navigation': { usePathname: () => pathname },
    '@/components/use-cached-page-read': { usePageBackgroundSync: () => {} },
    '@/components/editor-page-skeleton': { EditorPageSkeleton: () => React.createElement('p', null, 'Loading queue') },
    '@/components/admin-toast-provider': { useAdminToast: () => ({ success: blocked, error: blocked }) },
    '@/lib/admin-ui': {},
    '@/lib/private-attachment-download': { startPrivateAttachmentDownload: blocked },
    '@/lib/editor-read-cache': {
      getCachedEditorBatches: () => state === 'loaded' ? [] : null,
      getRememberedEditorQueueUi: () => ({ groupMode: 'day', dateSortOrder: 'desc', filter: 'ALL', search: '', packageFilter: 'ALL' }),
      fetchEditorBatches: blocked, rememberEditorQueueUi: blocked, shouldSynchronizeEditorBatches: blocked,
    },
  }).default
  return renderToStaticMarkup(React.createElement(Queue, { basePath: '/editor' }))
}

test('editing queue retains its primary heading in loaded, loading and failed states', () => {
  for (const state of ['loaded', 'loading', 'failed'] as const) {
    const markup = renderQueue('/editor/queue', state)
    assert.match(markup, /<h1[^>]*>Editing Batches<\/h1>/)
    assert.equal((markup.match(/<h1\b/g) ?? []).length, 1)
  }
})

test('embedded editing queue uses a subordinate heading without duplicating the page H1', () => {
  const markup = renderQueue('/editor/filtering', 'loaded')
  assert.match(markup, /<h2[^>]*>Editing Batches<\/h2>/)
  assert.doesNotMatch(markup, /<h1\b/)
})

test('portal stage navigation never overrides its touch target below 44px', () => {
  const css = read('components/portal-workspace.module.css')
  const rules = [...css.matchAll(/\.step\s*\{([^}]+)\}/g)]
  const minimums = rules.flatMap(rule => [...rule[1].matchAll(/min-height:\s*(\d+)px/g)].map(match => Number(match[1])))
  assert.ok(minimums.length >= 1)
  assert.ok(minimums.every(height => height >= 44), `Portal stage targets: ${minimums.join(', ')}`)
})
