import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('content management is staff-only and public output is restricted to presentation fields', async () => {
  const [adminRoute, publicRoute, page, footer, migration] = await Promise.all([
    readFile(new URL('../app/api/admin/website-content/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/website-content/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/admin/content/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/footer.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20260926175903_website_content_management.sql', import.meta.url), 'utf8'),
  ])
  assert.match(adminRoute, /requireWorkflowAuth\('admin'/)
  assert.match(adminRoute, /Google Maps embed link/)
  assert.doesNotMatch(publicRoute, /updated_by|auth\.users/)
  assert.match(page, /Content Management/)
  assert.match(footer, /useWebsiteContent/)
  assert.match(migration, /enable row level security/i)
  assert.match(migration, /revoke all on table public\.website_content_settings from public, anon, authenticated/i)
})
