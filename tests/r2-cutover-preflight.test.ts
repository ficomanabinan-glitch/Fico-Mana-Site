import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const preflight = readFileSync(
  'supabase/maintenance/20260915_r2_cutover_preflight.sql',
  'utf8',
)

test('R2 cutover report is read-only and mirrors every Phase 2 blocking gate', () => {
  const normalized = preflight.toLowerCase()

  assert.match(normalized, /as cutover_ready/)
  assert.match(normalized, /active_multipart_uploads/)
  assert.match(normalized, /gallery_files_not_verified/)
  assert.match(normalized, /deliverable_files_not_verified/)
  assert.match(normalized, /completed_editor_uploads_without_r2_key/)
  assert.match(normalized, /invalid_selected_photo_relationships/)
  assert.match(normalized, /print_allocations_with_incomplete_lineage/)
  assert.match(normalized, /booking_namespaces_not_ready/)
  assert.match(normalized, /editing_batches_without_r2_namespace/)

  assert.doesNotMatch(normalized, /\b(insert|update|delete|alter|drop|truncate|grant|revoke)\b/)
})
