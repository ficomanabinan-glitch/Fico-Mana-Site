import { type Locator, type Page } from '@playwright/test'
import { test as workspaceTest, expect, CLIENT_NAME, FIRST_BOOKING, SECOND_BOOKING, workspaceBooking } from './fixtures/client-workspace'

const FILE_NAME = 'SYNTHETIC-SELECTION-01.JPG'
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2K0AAAAASUVORK5CYII=', 'base64')

const test = workspaceTest.extend<{ legacy: void }>({
  legacy: [async ({ workspace, page, context, baseURL }, provide) => {
    // Depend on the base fixture before layering local routes so strict safety guards stay active.
    expect(workspace.page).toBe(page)
    await page.clock.install({ time: new Date('2026-10-01T04:00:00Z') })
    await context.route('**/api/**', async route => {
      const url = new URL(route.request().url())
      if (url.origin !== new URL(baseURL!).origin || route.request().method() !== 'GET') { await route.fallback(); return }
      if (url.pathname === '/api/bookings' || url.pathname === '/api/editor-workflow/filtering') {
        const booking = { ...workspaceBooking(), rawPhotoStatus: 'Pending Review',
          receiptUrl: '/api/receipts/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }
        if (url.pathname === '/api/bookings') {
          booking.bookingStatus = 'Pending Verification'; booking.paymentStatus = 'Pending Verification'
        }
        await route.fulfill({ json: [booking] }); return
      }
      if (url.pathname === `/api/editor-workflow/selections/${FIRST_BOOKING}/files`) {
        await route.fulfill({ json: { files: [{ id: 'synthetic-selected-file', fileName: FILE_NAME,
          available: true, preference: 'Standard Softness', extraEdit: false }] } }); return
      }
      if (url.pathname.startsWith('/api/receipts/') || url.pathname === '/api/editor-workflow/files/synthetic-selected-file') {
        await route.fulfill({ contentType: 'image/png', body: image }); return
      }
      await route.fallback()
    })
    await provide()
  }, { auto: true }],
})

async function focusRemainsOwned(page: Page, dialog: Locator) {
  // DOM inspection measures focus ownership; all interaction uses real keyboard input.
  for (const key of ['Tab', 'Tab', 'Tab', 'Shift+Tab']) {
    await page.keyboard.press(key)
    const ownedOrChrome = await dialog.evaluate(element => {
      if (element.contains(document.activeElement)) return true
      // Native dialogs may Tab into browser chrome. Body is not a background control;
      // require a genuine modal top layer AND prove a background DOM control remains inert.
      if (document.activeElement !== document.body || !element.matches(':modal')) return false
      const background = Array.from(document.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea'))
        .find(control => !element.contains(control) && control.getClientRects().length > 0)
      if (!background) return false
      background.focus()
      return document.activeElement === document.body || element.contains(document.activeElement)
    })
    expect.soft(ownedOrChrome, `Background DOM focus escaped the active modal after ${key}`).toBe(true)
  }
}

test('payment receipt review is reachable by keyboard and closes back to its opener', async ({ workspace }, testInfo) => {
  const { page } = workspace
  await page.goto('/admin/verification')
  await expect(page.getByRole('heading', { name: CLIENT_NAME, exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('receipt-keyboard-entry.png') })
  const opener = page.getByRole('button', { name: /(?:view|review).*receipt/i }).first()
  await expect(opener).toBeVisible()
  await opener.focus(); await opener.press('Enter')
  const dialog = page.getByRole('dialog', { name: `Receipt for ${CLIENT_NAME}`, exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveAccessibleName(/receipt|verification|Ana María/i)
  await expect(dialog).toHaveAttribute('aria-modal', 'true')
  await expect.poll(() => dialog.evaluate(element => element.contains(document.activeElement))).toBe(true)
  await focusRemainsOwned(page, dialog)
  await page.screenshot({ path: testInfo.outputPath('receipt-dialog-keyboard.png') })
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0); await expect(opener).toBeFocused()
})

test('payment rejection has modal semantics and labelled reasons and cancels with Escape without writing', async ({ workspace }, testInfo) => {
  const { page } = workspace
  await page.goto('/admin/verification')
  const opener = page.getByRole('button', { name: 'Reject', exact: true }).first()
  await opener.focus(); await opener.press('Enter')
  const title = page.getByRole('heading', { name: 'Reject Payment Receipt', exact: true })
  await expect(title).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('payment-rejection-open.png') })
  const dialog = page.getByRole('dialog', { name: 'Reject Payment Receipt', exact: true })
  await expect.soft(dialog).toBeVisible()
  await expect.soft(page.getByRole('combobox', { name: 'Rejection Reason', exact: true })).toBeVisible()
  if (await dialog.count()) await focusRemainsOwned(page, dialog)
  await page.keyboard.press('Escape')
  await expect.soft(title).toHaveCount(0)
  await expect.soft(opener).toBeFocused()
})

test('selected photo details own keyboard focus and Escape restores the row review button', async ({ workspace }, testInfo) => {
  const { page } = workspace
  await page.goto(`/editor/filtering?search=${FIRST_BOOKING}&tab=queue`)
  await page.evaluate(() => {
    const qaWindow = window as typeof window & { __qaModalFocusEvents?: Array<{ event: string; tag: string; id: string; label: string | null }> }
    qaWindow.__qaModalFocusEvents = []
    for (const eventName of ['focusin', 'focusout']) document.addEventListener(eventName, event => {
      const target = event.target instanceof HTMLElement ? event.target : null
      qaWindow.__qaModalFocusEvents?.push({ event: eventName, tag: target?.tagName || '', id: target?.id || '', label: target?.getAttribute('aria-label') || null })
    })
  })
  const opener = page.getByRole('button', { name: 'Review Selected Photos', exact: true })
  await opener.focus(); await opener.press('Enter')
  const title = page.getByRole('heading', { name: 'Selected Photos', exact: true })
  await expect(title).toBeVisible()
  const dialog = page.getByRole('dialog', { name: 'Selected Photos', exact: true })
  const sampleFocus = (stage: string) => dialog.evaluate((element, currentStage) => {
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const qaWindow = window as typeof window & { __qaModalFocusEvents?: Array<{ event: string; tag: string; id: string; label: string | null }> }
    return { stage: currentStage, modal: element.matches(':modal'), open: (element as HTMLDialogElement).open,
      owned: element.contains(active), active: { tag: active?.tagName, id: active?.id, label: active?.getAttribute('aria-label') },
      events: qaWindow.__qaModalFocusEvents?.slice(-20) || [] }
  }, stage)
  const focusSamples = [await sampleFocus('before image ready')]
  await expect(page.getByRole('button', { name: `Preview ${FILE_NAME}`, exact: true })).toBeVisible()
  focusSamples.push(await sampleFocus('image ready before screenshot'))
  await page.screenshot({ path: testInfo.outputPath('selected-photo-details.png') })
  focusSamples.push(await sampleFocus('after screenshot'))
  await testInfo.attach('selected-photo-focus-diagnostic', { body: JSON.stringify(focusSamples, null, 2), contentType: 'application/json' })
  await expect.soft(dialog).toBeVisible()
  if (await dialog.count()) {
    await expect.poll(() => dialog.evaluate(element => element.contains(document.activeElement))).toBe(true)
    await focusRemainsOwned(page, dialog)
  }
  await page.keyboard.press('Escape')
  await expect.soft(title).toHaveCount(0)
  await expect.soft(opener).toBeFocused()
})

test('nested full photo preview traps Tab and restores its photo opener before the row opener', async ({ workspace }, testInfo) => {
  const { page } = workspace
  await page.goto(`/editor/filtering?search=${FIRST_BOOKING}&tab=queue`)
  const rowOpener = page.getByRole('button', { name: 'Review Selected Photos', exact: true })
  await rowOpener.focus(); await rowOpener.press('Enter')
  const photoOpener = page.getByRole('button', { name: `Preview ${FILE_NAME}`, exact: true })
  await photoOpener.focus(); await photoOpener.press('Enter')
  const preview = page.getByRole('dialog', { name: `Preview ${FILE_NAME}`, exact: true })
  await expect(preview).toBeVisible()
  await expect(preview.getByRole('button', { name: 'Close full photo preview', exact: true })).toBeFocused()
  await page.screenshot({ path: testInfo.outputPath('nested-photo-preview.png') })
  await focusRemainsOwned(page, preview)
  // Re-enter through its keyboard close control so Escape tests the active layer, not leaked background focus.
  await preview.getByRole('button', { name: 'Close full photo preview', exact: true }).focus()
  await page.keyboard.press('Escape')
  await expect(preview).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Selected Photos', exact: true })).toBeVisible()
  await expect.soft(photoOpener).toBeFocused()
  await page.keyboard.press('Escape')
  await expect.soft(page.getByRole('heading', { name: 'Selected Photos', exact: true })).toHaveCount(0)
  await expect.soft(rowOpener).toBeFocused()
})

test('selection rejection exposes reason and notes labels and cancels only its active dialog', async ({ workspace }, testInfo) => {
  const { page } = workspace
  await page.goto(`/editor/filtering?search=${FIRST_BOOKING}&tab=queue`)
  await page.getByRole('button', { name: 'Review Selected Photos', exact: true }).press('Enter')
  const opener = page.getByRole('button', { name: 'Reject Selection', exact: true })
  await opener.focus(); await opener.press('Enter')
  const title = page.getByRole('heading', { name: 'Reject Raw Photo', exact: true })
  await expect(title).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('selection-rejection-open.png') })
  const dialog = page.getByRole('dialog', { name: 'Reject Raw Photo', exact: true })
  await expect.soft(dialog).toBeVisible()
  await expect.soft(page.getByRole('combobox', { name: 'Rejection Reason', exact: true })).toBeVisible()
  await expect.soft(page.getByRole('textbox', { name: 'Additional Notes (optional)', exact: true })).toBeVisible()
  if (await dialog.count()) await focusRemainsOwned(page, dialog)
  await page.keyboard.press('Escape')
  await expect.soft(title).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Selected Photos', exact: true })).toBeVisible()
  await expect.soft(opener).toBeFocused()
})

test('client workspace remains operable at 200 percent root text with reduced motion', async ({ workspace }, testInfo) => {
  const { page } = workspace
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await workspace.open()
  const originalSize = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize))
  await page.evaluate(size => { document.documentElement.style.fontSize = `${size * 2}px` }, originalSize)
  await expect.poll(() => page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize))).toBe(originalSize * 2)
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)
  const main = page.getByRole('main')
  expect.soft(await main.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
  const selector = page.getByRole('combobox', { name: /Booking · 2 linked to this client/ })
  await selector.selectOption(SECOND_BOOKING)
  await expect(page.getByRole('heading', { name: CLIENT_NAME, exact: true })).toBeVisible()
  await expect(selector).toHaveValue(SECOND_BOOKING)
  const search = page.getByRole('button', { name: 'Search clients', exact: true })
  await search.focus(); await search.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Search clients', exact: true })
  await expect(dialog.getByRole('searchbox', { name: 'Find a client or booking', exact: true })).toBeFocused()
  const motion = await dialog.evaluate(element => {
    const style = getComputedStyle(element)
    const seconds = (value: string) => value.split(',').map(part => parseFloat(part) * (part.trim().endsWith('ms') ? 0.001 : 1))
    return { transitions: seconds(style.transitionDuration), animations: seconds(style.animationDuration), properties: style.transitionProperty, identityTransform: style.transform === 'none' || new DOMMatrixReadOnly(style.transform).isIdentity, translate: style.translate, animationName: style.animationName }
  })
  expect(Math.max(...motion.transitions)).toBeLessThanOrEqual(0.1)
  expect(motion.animationName).toBe('none')
  expect(motion.identityTransform).toBe(true)
  expect(motion.translate).toBe('none')
  expect(motion.properties).not.toMatch(/all|transform|translate/)
  expect.soft(await dialog.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
  await page.screenshot({ path: testInfo.outputPath('workspace-200pct-text-reduced-motion.png') })
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0); await expect(search).toBeFocused()
})
