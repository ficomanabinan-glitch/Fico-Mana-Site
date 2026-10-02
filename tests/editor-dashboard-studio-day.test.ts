import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './helpers/load-ts.ts'
import { componentHarness, elements, content } from './helpers/component-harness.ts'
import { getEditorDashboardNextTask } from '../lib/editor-dashboard-next-task.ts'

test('dashboard onsite reads, cache, date label and actions use Manila day across a UTC browser midnight boundary', async t => {
  const previousTimezone = process.env.TZ
  process.env.TZ = 'UTC'
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-01T16:30:00Z').getTime() })
  const previousFetch = globalThis.fetch
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { addEventListener() {}, removeEventListener() {} } })
  t.after(() => {
    globalThis.fetch = previousFetch
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow)
    else Reflect.deleteProperty(globalThis, 'window')
    if (previousTimezone === undefined) delete process.env.TZ
    else process.env.TZ = previousTimezone
  })
  assert.equal(new Date().getDate(), 1, 'Browser-local day is still October 1')
  const reads: string[] = [], cacheKeys: string[] = []
  const jobs = [{ bookingId: 'FM-SYNTHETIC', customerName: 'Synthetic Client', packageName: 'Synthetic Package', bookingTime: '1 PM', galleryCount: 0, storageReady: true }]
  globalThis.fetch = async url => { reads.push(String(url)); return Response.json({ batch: { jobs } }) }
  const h = componentHarness()
  const presentation = loadTs<{ studioDay: (now?: Date) => string }>('lib/new-admin/presentation-data.ts', { '@/lib/sales-finance': {} })
  const setJobs = () => {}, setLoading = () => {}
  const ui = loadTs<typeof import('../components/editor-dashboard.tsx')>('components/editor-dashboard.tsx', {
    react: { ...h.react, useCallback: (fn: unknown, deps: unknown[]) => h.react.useMemo(() => fn, deps) },
    'next/link': { __esModule: true, default: 'a' },
    '@/components/use-cached-page-read': { useCachedPageRead: (key: string) => { cacheKeys.push(key); return [jobs, setJobs, false, setLoading] } },
    '@/components/admin-toast-provider': { useAdminToast: () => ({ error() {}, success() {} }) },
    '@/components/editor-portal-shell': { useEditorSession: () => ({ role: 'onsite', capabilities: { edit: false, onsite: true } }) },
    '@/components/editor-page-skeleton': {}, '@/lib/admin-ui': {}, '@/lib/private-attachment-download': {},
    '@/lib/editor-dashboard-next-task': { getEditorDashboardNextTask },
    '@/lib/new-admin/presentation-data': presentation,
    '@/lib/editor-read-cache': { getCachedEditorBatches: () => [], shouldSynchronizeEditorBatches: () => false },
  })
  const tree = h.render(() => ui.default())
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(reads, ['/api/editor-workflow/onsite?date=2026-10-02&fast=1'])
  assert.equal(cacheKeys[0], 'editor:today:2026-10-02')
  assert.match(content(tree), /Friday, October 2, 2026/)
  const actions = elements(tree, el => el.type === 'a' && String(el.props.href).includes('booking=FM-SYNTHETIC'))
  assert.equal(actions.length, 2)
  assert.ok(actions.every(el => el.props.href === '/editor/onsite?date=2026-10-02&booking=FM-SYNTHETIC'))
  h.unmount()
})
