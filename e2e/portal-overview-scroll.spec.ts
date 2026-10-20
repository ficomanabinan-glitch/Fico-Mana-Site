import { test, expect, PRIVATE_PORTAL_ID } from './fixtures/private-portal'

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' })

for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 664 }, { width: 896, height: 414 }]) {
  test(`Overview reaches its QR and last detail without moving its header at ${viewport.width}x${viewport.height}`, async ({ page, privatePortal }, testInfo) => {
    privatePortal.mode('selection')
    await page.setViewportSize(viewport)
    await page.goto(`/portal/${PRIVATE_PORTAL_ID}`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: 'Try Again', exact: true }).click()
    const trigger = page.getByRole('button', { name: 'Overview', exact: true })
    await trigger.click()
    const panel = page.getByRole('dialog', { name: 'Overview', exact: true })
    const heading = panel.getByRole('heading', { name: 'Overview', exact: true })
    await expect(heading).toBeFocused()
    const headerBefore = await heading.boundingBox()
    const details = panel.getByRole('region', { name: 'Overview details', exact: true })
    await expect(details).toHaveCSS('overflow-y', 'auto')
    const qrDownload = panel.getByRole('button', { name: 'Download QR', exact: true })
    await qrDownload.focus()
    await expect(qrDownload).toBeInViewport({ ratio: 1 })
    await expect(panel.getByRole('button', { name: 'Copy Link', exact: true })).toBeInViewport({ ratio: 1 })
    await expect(heading).toBeInViewport({ ratio: 1 })
    expect((await heading.boundingBox())!.y).toBeCloseTo(headerBefore!.y, 0)
    await expect.poll(() => details.evaluate(element => element.scrollTop)).toBeGreaterThan(0)
    await details.focus()
    await page.keyboard.press('Control+End')
    await expect(panel.getByTestId('portal-qr-code').getByText(/Keep this/)).toBeInViewport({ ratio: 1 })
    await page.screenshot({ path: testInfo.outputPath('overview-scrolled.png') })
    await page.keyboard.press('Escape')
    await expect(panel).toBeHidden()
    await expect(trigger).toBeFocused()
  })
}
