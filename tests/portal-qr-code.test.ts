import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('client portal QR uses the existing signed portal URL without an external QR service', async () => {
  const [qrCode, portalPage, provisioningPage, workflow] = await Promise.all([
    readFile('components/portal-qr-code.tsx', 'utf8'),
    readFile('app/portal/[id]/page.tsx', 'utf8'),
    readFile('app/admin/provisioning/page.tsx', 'utf8'),
    readFile('lib/editor-workflow.ts', 'utf8'),
  ])

  assert.match(workflow, /shareUrl: portalUrl\(publicId\)/)
  assert.match(workflow, /Portal expired\./)
  assert.match(portalPage, /<PortalQrCode portalUrl=\{data\.shareUrl\}/)
  assert.match(qrCode, /QRCodeCanvas/)
  assert.match(qrCode, /value=\{portalUrl\}/)
  assert.match(qrCode, /level="Q"/)
  assert.match(qrCode, /Keep this code private/)
  assert.doesNotMatch(qrCode, /api\.qrserver|chart\.googleapis|quickchart/i)

  assert.match(provisioningPage, /showPortalQr/)
  assert.match(provisioningPage, /This QR expired with the Client Portal link/)
  assert.match(provisioningPage, /portalUrl:await getPortalUrl\(item\.bookingId\)/)
  assert.match(provisioningPage, /<PortalQrDialog portal=\{qrPortal\}/)
  assert.match(provisioningPage, /aria-label="Close client portal QR"/)
})

test('expired portal links and QR codes are rejected together and can be explicitly renewed', async () => {
  const [sessionRoute, provisioning, overviewRoute] = await Promise.all([
    readFile('app/api/portal/session/route.ts', 'utf8'),
    readFile('lib/booking-provisioning.ts', 'utf8'),
    readFile('app/api/provisioning/route.ts', 'utf8'),
  ])

  assert.match(sessionRoute, /portal\.expires_at[\s\S]*Portal access has expired/)
  assert.match(sessionRoute, /portal\.status === 'expired'/)
  assert.match(provisioning, /clientPortalUrl: portal\?\.public_id && portalActive/)
  assert.match(provisioning, /portal\.status === 'expired' \|\| portalExpiryPassed/)
  assert.match(provisioning, /renewedUntil\.setUTCDate/)
  assert.match(overviewRoute, /status: portalExpired \? 'expired' : portal\.status/)
})

test('portal QR can be copied or downloaded for the client', async () => {
  const qrCode = await readFile('components/portal-qr-code.tsx', 'utf8')

  assert.match(qrCode, /navigator\.clipboard\.writeText\(portalUrl\)/)
  assert.match(qrCode, /canvas\.toDataURL\('image\/png'\)/)
  assert.match(qrCode, />\s*Download QR\s*</)
  assert.match(qrCode, /Try: download the QR code instead/)
})
