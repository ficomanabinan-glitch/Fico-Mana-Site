import { test, expect, PRIVATE_PORTAL_ID, PRIVATE_PHOTO_IDS } from './fixtures/private-portal'

test.use({ serviceWorkers: 'block' })

for (const width of [390, 901, 1440]) {
  test.describe(`photo download icons at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } })

    /** SC1-SC2 / R1-R5: real rendered geometry and keyboard isolation; no file transfer. */
    test('raw and enhanced downloads stay top-left with filenames and safe retry', async ({ page, privatePortal }, testInfo) => {
      privatePortal.mode('downloads')
      const preparations: string[] = []
      await page.route('**/single-photo/*?kind=*', async route => {
        preparations.push(`${route.request().method()} ${new URL(route.request().url()).pathname}${new URL(route.request().url()).search}`)
        await route.fulfill({ json: { error: 'Synthetic preparation interrupted. Try again.' } })
      })
      await page.goto(`/portal/${PRIVATE_PORTAL_ID}`)
      await page.getByRole('button', { name: 'Try Again', exact: true }).click()
      const enhanced = page.getByRole('button', { name: 'Download SYNTHETIC-ENHANCED.JPG', exact: true })
      await expect(enhanced).toBeVisible()
      const hero = page.getByRole('button', { name: 'Preview SYNTHETIC-ENHANCED.JPG', exact: true })
      const checkPosition = async (control: typeof enhanced, photo: typeof hero) => {
        const icon = await control.boundingBox(), image = await photo.boundingBox()
        expect(icon).not.toBeNull(); expect(image).not.toBeNull()
        expect(icon!.width).toBeGreaterThanOrEqual(44); expect(icon!.height).toBeGreaterThanOrEqual(44)
        expect(icon!.x - image!.x).toBeGreaterThanOrEqual(6); expect(icon!.x - image!.x).toBeLessThanOrEqual(10)
        expect(icon!.y - image!.y).toBeGreaterThanOrEqual(6); expect(icon!.y - image!.y).toBeLessThanOrEqual(10)
        await expect(control).toHaveText('')
        expect(await control.evaluate(node => node.closest('button') === node && !node.parentElement?.closest('button'))).toBe(true)
      }
      await checkPosition(enhanced, hero)
      await page.screenshot({ path: testInfo.outputPath(`enhanced-icon-${width}.png`), fullPage: true })
      await enhanced.focus(); await page.keyboard.press('Enter')
      await expect(page.getByRole('alert').filter({ hasText: 'Synthetic preparation interrupted.' })).toHaveText('Synthetic preparation interrupted. Try again.')
      await expect(enhanced).toBeEnabled()
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await page.getByRole('button', { name: 'Photos', exact: true }).click()
      const card = page.getByTestId('portal-contact-sheet').locator('article').first()
      const raw = card.getByRole('button', { name: 'Download SYNTHETIC-01.JPG', exact: true })
      await expect(raw).toBeVisible()
      await checkPosition(raw, card.getByRole('button', { name: /Preview SYNTHETIC-01.JPG/ }))
      await expect(card.getByText('SYNTHETIC-01.JPG', { exact: true })).toBeVisible()
      const filename = await card.getByText('SYNTHETIC-01.JPG', { exact: true }).boundingBox()
      expect(filename!.height).toBeLessThan(40)
      const selectionBadge = await card.getByText('1', { exact: true }).boundingBox()
      const downloadBounds = await raw.boundingBox()
      expect(downloadBounds!.x + downloadBounds!.width).toBeLessThanOrEqual(selectionBadge!.x)
      await page.screenshot({ path: testInfo.outputPath(`raw-icon-${width}.png`), fullPage: true })
      await raw.focus(); await page.keyboard.press('Enter')
      await expect(card.getByRole('alert')).toHaveText('Synthetic preparation interrupted. Try again.')
      await expect(raw).toBeEnabled()
      await raw.click()
      await expect.poll(() => preparations.length).toBe(3)
      await expect(page.getByRole('dialog')).toHaveCount(0)
      expect(privatePortal.selectionPosts).toEqual([])
      expect(preparations).toEqual([
        `POST /api/editor-workflow/portal/${PRIVATE_PORTAL_ID}/single-photo/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa?kind=deliverable`,
        ...Array(2).fill(`POST /api/editor-workflow/portal/${PRIVATE_PORTAL_ID}/single-photo/${PRIVATE_PHOTO_IDS[0]}?kind=original`),
      ])
      expect(privatePortal.requests.some(request => /folder|manifest/.test(request.path))).toBe(false)
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
    })
  })
}

/** Individual downloads remain independent of selection and bulk-download eligibility. */
test('open selection has visible download icons that do not change choices', async ({ page, privatePortal }) => {
  const preparations: string[] = []
  await page.route('**/single-photo/*?kind=*', async route => {
    preparations.push(route.request().url())
    await route.fulfill({ json: { error: 'Synthetic preparation interrupted. Try again.' } })
  })
  await page.goto(`/portal/${PRIVATE_PORTAL_ID}`)
  await page.getByRole('button', { name: 'Try Again', exact: true }).click()
  await expect(page.getByTestId('portal-contact-sheet')).toBeVisible()
  const sheet = page.getByTestId('portal-contact-sheet')
  await expect(sheet.getByRole('button', { name: /^Download SYNTHETIC-/ })).toHaveCount(5)
  const icon = sheet.getByRole('button', { name: 'Download SYNTHETIC-01.JPG', exact: true })
  await expect(icon).toBeVisible()
  const selectionBefore = await sheet.getByRole('button', { pressed: true }).count()
  await icon.click()
  await expect(sheet.getByRole('alert')).toHaveText('Synthetic preparation interrupted. Try again.')
  await expect(icon).toBeEnabled()
  await expect(sheet.getByRole('button', { pressed: true })).toHaveCount(selectionBefore)
  expect(preparations).toHaveLength(1)
  expect(privatePortal.selectionPosts).toEqual([])
  expect(privatePortal.requests.some(request => /folder|manifest/.test(request.path))).toBe(false)
})
