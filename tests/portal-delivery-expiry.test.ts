import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const cleanup = readFileSync('supabase/migrations/20260914142027_remove_retired_storage_contract.sql', 'utf8')

test('R2 deliverable publication is the only database event that starts portal expiry', () => {
  assert.match(cleanup, /create trigger start_portal_expiry_on_delivery[\s\S]*after insert or update of published_at on public\.deliverable_files/)
  assert.match(cleanup, /drop trigger if exists start_portal_expiry_on_link_release on public\.bookings/)
  assert.doesNotMatch(cleanup, /create trigger start_portal_expiry_on_link_release/i)
  assert.match(cleanup, /portal\.deliverables_uploaded_at is not null then return new/)
  assert.match(cleanup, /expires_at = coalesce\(portal\.expires_at, released_at \+ days \* interval '24 hours'\)/)
})

test('portal expiry uses R2-neutral settings and keeps delivery access service-only', () => {
  assert.match(cleanup, /select portal_expiry_days into days from public\.storage_settings/)
  assert.match(cleanup, /revoke all on function public\.start_portal_expiry_on_delivery\(\)[\s\S]*from public, anon, authenticated/)
  assert.match(cleanup, /grant execute on function public\.start_portal_expiry_on_delivery\(\) to service_role/)
  assert.doesNotMatch(cleanup, /truncate\s+(?:table\s+)?public\.(?:gallery_files|deliverable_files|print_allocations)/i)
})

test('application code does not compete with the database delivery clock', () => {
  for (const file of ['lib/editor-workflow.ts', 'lib/booking-provisioning.ts']) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /setPortalExpiryFromDelivery/)
  }
  assert.match(readFileSync('components/client-portal-page.tsx', 'utf8'), /<PortalExpiryNotice expiry=\{data\.expiry\}/)
  assert.match(readFileSync('components/client-photo-selection.tsx', 'utf8'), /Your selection is submitted and locked/)
})
