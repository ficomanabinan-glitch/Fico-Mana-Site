import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('onsite dashboard uses a lightweight summary instead of full batch detail', async () => {
  const route = await readFile('app/api/editor-workflow/[...path]/route.ts', 'utf8')
  const workflow = await readFile('lib/editor-workflow.ts', 'utf8')

  assert.match(route, /getOnsiteBatchSummary\(workspaceId, shootDate, \{ synchronize \}\)/)
  assert.match(workflow, /export async function getOnsiteBatchSummary/)
  assert.match(workflow, /select\('id,customer_name,customer_email,package_name,booking_time,booking_status'\)/)
  assert.doesNotMatch(
    route,
    /path\[0\] === 'onsite'[\s\S]{0,600}getBatchDetail/,
    'onsite endpoint must not depend on the full editing report',
  )
})

test('dashboard errors include a Try solution and a visible retry action', async () => {
  const dashboard = await readFile('components/editor-dashboard.tsx', 'utf8')

  assert.match(dashboard, /Try: refresh the dashboard once/)
  assert.match(dashboard, /role="alert"/)
  assert.match(dashboard, /\/>Retry/)
  assert.match(dashboard, /setOnsiteError\(''\)/)
})
