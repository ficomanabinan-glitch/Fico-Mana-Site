import { test, expect, EDITOR_BATCH, EDITOR_BOOKING, EDITOR_CLIENT, editorPaths, type EditorReadSource } from './fixtures/editor-service-recovery'

test.use({ serviceWorkers: 'block' })
const sources: EditorReadSource[] = ['onsite', 'queue', 'upload', 'batch']
const retryNames = { onsite: 'Retry onsite schedule', queue: 'Retry editing batches', upload: 'Retry upload history', batch: 'Retry batch' }
const falseEmpty = { onsite: 'No clients scheduled for this date', queue: 'No batches match this view', upload: 'No uploads recorded yet', batch: 'Batch not found.' }
const loadingLabels = { onsite: 'Loading onsite upload', queue: 'Loading editing queue', upload: 'Loading editing queue', batch: 'Loading editing batch' }

test('phone queue uses a compact stage selector without changing stage filtering', async ({ page, editorRead }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  editorRead.configure('queue', 'populated')
  await page.goto(editorPaths.queue)
  const stage = page.getByRole('combobox', { name: 'Editing stage', exact: true })
  await expect(stage).toBeVisible()
  await expect(stage.locator('option')).toHaveCount(6)
  await expect(page.getByText(EDITOR_BATCH, { exact: true })).toBeVisible()
  await stage.selectOption('UPLOAD_FAILED')
  await expect(page.getByText('No batches match this view', { exact: true })).toBeVisible()
  await stage.selectOption('ALL')
  await expect(page.getByText(EDITOR_BATCH, { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Waiting for Selection', exact: true })).toHaveCount(0)
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(stage).not.toBeVisible()
  await expect(page.getByRole('button', { name: 'Waiting for Selection', exact: true })).toBeVisible()
})

for (const width of [390, 768, 1440]) {
  test.describe(`Editor metadata recovery at ${width}`, () => {
    test.use({ viewport: { width, height: width === 390 ? 844 : width === 768 ? 1024 : 900 } })
    for (const source of sources) {
      // ER-S1–4 → ER-1/2/3/4/5: failed metadata must not masquerade as a successful empty view.
      test(`${source} distinguishes loading and outage, retries the same context and retains verified rows`, async ({ page, editorRead }, testInfo) => {
        editorRead.configure(source)
        const held = editorRead.hold()
        await page.goto(editorPaths[source])
        await held.requested
        await expect(page.getByLabel(loadingLabels[source], { exact: true })).toBeVisible()
        if (source === 'upload') await expect(page.getByRole('heading', { name: 'Return edited batches to clients', exact: true })).toBeVisible()
        held.release()
        const notice = page.getByRole('alert').filter({ has: page.getByRole('button', { name: retryNames[source], exact: true }) })
        // Negative oracles capture the real misleading UI, rather than only timing out on a new button.
        await expect.soft(page.getByText(falseEmpty[source], { exact: true })).toHaveCount(0)
        await expect(notice).toBeVisible()
        const retry = notice.getByRole('button', { name: retryNames[source], exact: true })
        await expect(retry).toBeEnabled()
        const retryBox = await retry.boundingBox()
        // Chromium can report a 44 CSS-pixel control as 43.99998 at mobile scale.
        expect(Math.round(retryBox!.height)).toBeGreaterThanOrEqual(44)
        await page.screenshot({ path: testInfo.outputPath(`editor-${source}-unavailable-${width}.png`) })
        editorRead.mode('populated')
        await retry.focus(); await expect(retry).toBeFocused(); await page.keyboard.press('Enter')
        await expect(notice).toHaveCount(0)
        if (source === 'onsite' || source === 'batch') await expect(page.getByText(EDITOR_CLIENT, { exact: true })).toBeVisible()
        else await expect(page.getByText(EDITOR_BATCH, { exact: true })).toBeVisible()
        if (source === 'onsite') await expect(page.getByRole('searchbox', { name: 'Search onsite clients', exact: true })).toHaveValue(EDITOR_BOOKING)
        if (source === 'queue') await expect(page.getByRole('textbox', { name: 'Search editing batches', exact: true })).toHaveValue(EDITOR_BOOKING)
        await expect(page).toHaveURL(new RegExp(`${editorPaths[source].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`))
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
        await page.screenshot({ path: testInfo.outputPath(`editor-${source}-recovered-${width}.png`) })
        if (source !== 'batch') {
          editorRead.mode('failed')
          // Existing read-only background-sync event, not an upload or server mutation.
          await page.evaluate(() => window.dispatchEvent(new Event('admin:db-synced')))
          await expect(notice).toBeVisible()
          await expect(page.getByText(source === 'onsite' ? EDITOR_CLIENT : EDITOR_BATCH, { exact: true })).toBeVisible()
          if (source === 'queue') await expect(page.getByRole('textbox', { name: 'Search editing batches', exact: true })).toHaveValue(EDITOR_BOOKING)
          editorRead.mode('empty')
          await notice.getByRole('button', { name: retryNames[source], exact: true }).click()
          await expect(notice).toHaveCount(0)
          await expect(page.getByText(falseEmpty[source], { exact: true })).toBeVisible()
        }
        expect(editorRead.reads.length).toBeGreaterThanOrEqual(2)
      })
    }
  })
}

test.describe('Malformed metadata is not a valid empty result', () => {
  test.use({ viewport: { width: 1440, height: 900 } })
  for (const source of sources) {
    // ER-S5–8 → ER-6: actual invalid 200 payload, not a new simulated network route.
    test(`${source} rejects malformed successful metadata and recovers`, async ({ page, editorRead }, testInfo) => {
      editorRead.configure(source, 'malformed')
      await page.goto(editorPaths[source])
      const notice = page.getByRole('alert').filter({ has: page.getByRole('button', { name: retryNames[source], exact: true }) })
      await expect.soft(page.getByText(falseEmpty[source], { exact: true })).toHaveCount(0)
      await expect(notice).toBeVisible()
      await page.screenshot({ path: testInfo.outputPath(`editor-${source}-malformed.png`) })
      editorRead.mode('populated')
      await notice.getByRole('button', { name: retryNames[source], exact: true }).click()
      await expect(notice).toHaveCount(0)
      await expect(page.getByText(source === 'onsite' || source === 'batch' ? EDITOR_CLIENT : EDITOR_BATCH, { exact: true })).toBeVisible()
    })
  }
})
