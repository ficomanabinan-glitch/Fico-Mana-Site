import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('Client Portals lives in Editor while booking management stays in Admin', async () => {
  const [adminLayout, editorShell, middleware, editorPage, editorDetail] = await Promise.all([
    readFile('app/admin/layout.tsx', 'utf8'),
    readFile('components/editor-portal-shell.tsx', 'utf8'),
    readFile('lib/supabase/middleware.ts', 'utf8'),
    readFile('app/editor/client-portals/page.tsx', 'utf8'),
    readFile('app/editor/client-portals/[id]/page.tsx', 'utf8'),
  ])

  assert.doesNotMatch(adminLayout, /label: 'Client Portals'/)
  assert.match(adminLayout, /label: 'Bookings', href: '\/admin\/bookings'/)
  assert.match(adminLayout, /label: 'Clients', href: '\/admin\/clients'/)
  assert.match(adminLayout, /label: 'Verification Queue', href: '\/admin\/verification'/)
  assert.match(editorShell, /label: 'Client Portals', href: '\/editor\/client-portals'/)
  assert.match(editorPage, /admin\/provisioning\/page/)
  assert.match(editorDetail, /admin\/provisioning\/\[id\]\/page/)

  assert.match(middleware, /legacyClientPortalRedirect/)
  assert.match(middleware, /\/editor\/client-portals\$\{suffix\}/)
  assert.doesNotMatch(middleware, /pathname\.startsWith\('\/api\/bookings'\)/)
  assert.match(middleware, /provisioning\(\?:\\\/audit\)\?\|portal-resources/)
})

test('Editor Client Portals uses portal-specific APIs and does not load the general booking record', async () => {
  const [list, detail, portalRoute, provisioningRoute, resourcesRoute, auditRoute] = await Promise.all([
    readFile('app/admin/provisioning/page.tsx', 'utf8'),
    readFile('app/admin/provisioning/[id]/page.tsx', 'utf8'),
    readFile('app/api/bookings/[id]/portal/route.ts', 'utf8'),
    readFile('app/api/bookings/[id]/provisioning/route.ts', 'utf8'),
    readFile('app/api/bookings/[id]/portal-resources/route.ts', 'utf8'),
    readFile('app/api/bookings/[id]/provisioning/audit/route.ts', 'utf8'),
  ])
  assert.match(list, /\/api\/bookings\/\$\{encodeURIComponent\(bookingId\)\}\/portal/)
  assert.doesNotMatch(list, /window\.open\(`\/admin\/portal/)
  assert.match(detail, /fetch\('\/api\/provisioning'/)
  assert.match(detail, /\/provisioning\/audit/)
  assert.match(detail, /\/portal-resources/)
  assert.doesNotMatch(detail, /fetch\(`\/api\/bookings\/\$\{encodeURIComponent\(bookingId\)\}`/)
  for (const route of [provisioningRoute, resourcesRoute, auditRoute]) {
    assert.match(route, /requireWorkflowAuth\('edit'/)
    assert.match(route, /workspace_id/)
    assert.match(route, /access\.workspaceId/)
  }
  assert.match(portalRoute, /requireWorkflowAuth\('view'/)
  assert.match(portalRoute, /workspace_id/)
  assert.match(portalRoute, /access\.workspaceId/)
})
