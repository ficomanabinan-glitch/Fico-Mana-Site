import { test, expect, PRIVATE_PORTAL_ID, PRIVATE_PIN } from './fixtures/private-portal'

test.use({ serviceWorkers: 'block' })

for (const category of ['capping-pinning', 'graduation'] as const) {
  test(`${category}: extra edit is available for prints, retained on refresh and submitted`, async ({ page, privatePortal }, testInfo) => {
    privatePortal.extraEdit(category)
    await page.goto(`/portal/${PRIVATE_PORTAL_ID}`)
    await page.getByRole('button', { name: 'Try Again', exact: true }).click()
    await page.getByRole('button', { name: 'Free Prints', exact: true }).click()
    const filename = category === 'capping-pinning' ? 'SYNTHETIC-03.JPG' : 'SYNTHETIC-06.JPG'
    const printName = category === 'capping-pinning' ? '4R print · Photo 1' : 'Toga picture'
    await page.getByRole('button', { name: `Use ${filename} for ${printName}`, exact: true }).click()
    if (category === 'graduation') await page.getByRole('button', { name: `Use ${filename} for Wallet size`, exact: true }).click()
    await expect(page.getByRole('button', { name: 'Continue to Add-ons', exact: true })).toBeEnabled()
    await page.reload()
    await page.getByRole('button', { name: 'Try Again', exact: true }).click()
    await expect(page.getByRole('button', { name: `Remove ${filename} for ${printName}`, exact: true })).toHaveAttribute('aria-pressed', 'true')
    await page.screenshot({ path: testInfo.outputPath(`${category}-extra-print.png`), fullPage: true })
    await page.getByRole('button', { name: 'Review', exact: true }).click()
    await page.getByRole('button', { name: 'Submit Final Selection', exact: true }).click()
    const confirmation = page.getByRole('dialog', { name: 'Confirm final selection', exact: true })
    await expect(confirmation.getByTestId('submission-balance')).toContainText('₱3,400')
    await confirmation.getByLabel('Final submission PIN', { exact: true }).fill(PRIVATE_PIN)
    await confirmation.getByRole('button', { name: 'Confirm & Submit', exact: true }).click()
    const prompt = page.getByRole('dialog', { name: 'Selection submitted', exact: true })
    await expect(prompt).toBeVisible()
    const portalFont = await page.getByRole('heading', { name: 'Your submitted choices', exact: true, includeHidden: true }).evaluate(element => getComputedStyle(element).fontFamily.split(',')[0])
    await expect.poll(() => prompt.getByRole('heading', { name: 'Selection submitted', exact: true }).evaluate(element => getComputedStyle(element).fontFamily.split(',')[0])).toBe(portalFont)
    await page.screenshot({ path: testInfo.outputPath(`${category}-submitted-font.png`) })
    expect(privatePortal.selectionPosts).toHaveLength(1)
    const payload = privatePortal.selectionPosts[0]
    expect(payload.includedFileIds).toHaveLength(category === 'capping-pinning' ? 2 : 5)
    expect(payload.extraEditFileIds).toHaveLength(1)
    expect(payload.printAllocations.find(item => item.category === 'TOGA_PICTURE_4R')?.fileId).toBe(payload.extraEditFileIds[0])
  })
}
