import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

test('final deliverables and expiry stay hidden until published photos exist', () => {
  const page = readFileSync('app/portal/[id]/page.tsx', 'utf8')
  assert.match(page, /const hasDeliverables = data\.deliverables\.length > 0/)
  assert.match(page, /const hasActiveExpiry = Boolean\(hasDeliverables && data\.expiry\?\.expiresAt\)/)
  assert.match(page, /\{hasDeliverables \? \(/)
  assert.match(page, /id="final-deliverables-title"/)
  assert.match(page, /<PortalDeliverableGallery key=\{publicId\} files=\{data\.deliverables\} \/>/)
  assert.match(page, /<Download[^>]+\/>[\s\S]*?Download All/)
  assert.match(page, /hasActiveExpiry && data\.expiry \? <PortalExpiryNotice expiry=\{data\.expiry\} \/>/)
  assert.doesNotMatch(page, /Your edited photos will appear/)
})
