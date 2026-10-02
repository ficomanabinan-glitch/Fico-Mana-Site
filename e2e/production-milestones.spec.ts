import { test, expect, FIRST_BOOKING, SECOND_BOOKING } from './fixtures/client-workspace'

test('production handoff is keyboard-disclosed and never carried into another linked booking', async ({ workspace }, testInfo) => {
  const { page } = workspace
  await page.setViewportSize({ width: 390, height: 844 })
  await workspace.open()
  const production = page.getByRole('heading', { name: 'Production and files', exact: true })
  await production.click()
  const handoff = page.getByText('Production handoff history', { exact: true })
  await handoff.focus(); await page.keyboard.press('Enter')
  const details = handoff.locator('..') // Native details contains the exact summary and its milestone description list.
  await expect(details).toContainText('READY FOR EDITING')
  await expect(details).toContainText('Oct 1, 2026, 9:00 AM')
  await expect(details).toContainText('Oct 1, 2026, 10:00 AM')
  await expect(details).toContainText('Not recorded')
  await expect(page.getByText(FIRST_BOOKING, { exact: true }).first()).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('production-handoff-phone.png') })
  await page.getByLabel('Booking · 2 linked to this client', { exact: true }).selectOption(SECOND_BOOKING)
  await expect(page.getByLabel('Booking · 2 linked to this client', { exact: true })).toHaveValue(SECOND_BOOKING)
  if (!(await handoff.isVisible())) await production.click()
  await expect(handoff).toBeVisible()
  if (await handoff.locator('..').getAttribute('open') === null) await handoff.click()
  await expect(handoff.locator('..')).not.toContainText('9:00 AM')
  await expect(handoff.locator('..')).not.toContainText('10:00 AM')
  expect(workspace.mutations).toEqual([])
  expect(workspace.runtimeErrors).toEqual([])
})
