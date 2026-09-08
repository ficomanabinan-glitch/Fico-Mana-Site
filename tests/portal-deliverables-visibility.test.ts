import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

test('final deliverables are hidden until published photos exist and have no checkmark heading', () => {
  const page = readFileSync('app/portal/[id]/page.tsx', 'utf8')
  const section = page.split('\n').find(line => line.includes('Final Deliverables'))!
  assert.match(section, /data\.deliverables\.length>0\?<section/)
  assert.match(section, /<PortalDeliverableGallery/)
  assert.match(section, /Download All/)
  assert.doesNotMatch(section, /CheckCircle|Your edited photos will appear/)
  assert.match(section, /<\/section>:null}/)
})
