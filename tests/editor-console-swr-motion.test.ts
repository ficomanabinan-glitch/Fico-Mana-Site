import assert from 'node:assert/strict'
import test from 'node:test'
import { existsSync, readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(path, 'utf8')

test('protected Editor pages reuse the persistent shell capability gate', () => {
  for (const file of [
    'app/editor/queue/page.tsx',
    'app/editor/upload/page.tsx',
    'app/editor/onsite/page.tsx',
    'app/editor/filtering/page.tsx',
    'app/editor/batch/[batchId]/page.tsx',
  ]) {
    const source = read(file)
    assert.match(source, /EditorCapabilityGate/)
    assert.doesNotMatch(source, /getStaffUser|getWorkflowAccess|canUseWorkflow/)
  }
  assert.equal(existsSync('app/editor/loading.tsx'), false)
})

test('capability gating does not weaken protected Editor APIs', () => {
  const gate = read('components/editor-capability-gate.tsx')
  assert.match(gate, /session\?\.capabilities\[capability\]/)
  assert.match(gate, /router\.replace\(fallback\)/)
  for (const file of [
    'app/api/editor-workflow/filtering/route.ts',
    'app/api/editor-workflow/filtering/[id]/review/route.ts',
    'app/api/editor-workflow/[...path]/route.ts',
  ]) {
    assert.match(read(file), /requireWorkflowAuth/)
  }
})

test('filtering queue excludes orphaned booking flags and recovers stale selection cards', () => {
  const filteringRoute = read('app/api/editor-workflow/filtering/route.ts')
  assert.match(filteringRoute, /from\('photo_selections'\)\.select\('booking_id'\)/)
  assert.match(filteringRoute, /selectionBookingIds\.has\(booking\.id\)/)

  const workflowRoute = read('app/api/editor-workflow/[...path]/route.ts')
  assert.match(workflowRoute, /if \(!selection\) return json\(\{ error: 'This booking no longer has a submitted selection\. Sync the queue and choose another client\.' \}, 404\)/)

  const queue = read('components/admin-raw-photo-queue.tsx')
  assert.match(queue, /if \(response\.status === 404\) \{[\s\S]*invalidateFilteringBookings\(\)[\s\S]*fetchQueue\(true\)/)
})

test('only pathname-keyed page content moves while console chrome stays stationary', () => {
  const css = read('app/console-motion.css')
  assert.match(css, /translateY\(6px\)/)
  assert.match(css, /180ms cubic-bezier\(\.22, 1, \.36, 1\)/)
  assert.match(css, /prefers-reduced-motion: reduce/)
  assert.match(read('app/layout.tsx'), /console-motion\.css/)

  for (const file of ['app/admin/layout.tsx', 'components/editor-portal-shell.tsx']) {
    const source = read(file)
    assert.match(source, /<main[\s\S]*<div key=\{pathname\} className="console-route-entry/)
    const wrapperAt = source.indexOf('<div key={pathname} className="console-route-entry')
    assert.ok(wrapperAt > source.indexOf('<header'))
    assert.ok(wrapperAt > source.indexOf('<aside'))
  }
  assert.match(read('components/editor-portal-shell.tsx'), /admin-console[^"\n]*font-sans/)
})
