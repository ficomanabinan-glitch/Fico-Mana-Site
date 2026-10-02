import { test as bookingTest, expect } from './fixtures/booking-clarity'
import { test as workspaceTest } from './fixtures/client-workspace'
import { test as portalTest, PRIVATE_PORTAL_ID } from './fixtures/private-portal'
import { renderedContrast } from './fixtures/rendered-contrast'

bookingTest('public footer is readable, school strip supports keyboard scrolling, and information fields retain 44px height', async ({ booking }) => {
  const { page } = booking
  await page.setViewportSize({ width: 390, height: 844 })
  await booking.open()
  await page.getByRole('button', { name: /October 2, 2026/ }).click()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  for (const input of [page.getByLabel('Full Name', { exact: false }), page.getByLabel('Phone Number'), page.getByLabel('Email Address *', { exact: true })]) {
    expect((await input.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  }
  const school = page.locator('#affiliations [role=region]')
  await school.scrollIntoViewIfNeeded(); await school.focus()
  await expect(school).toBeFocused()
  const before = await school.evaluate(element => element.scrollLeft)
  await school.press('ArrowRight')
  await expect.poll(() => school.evaluate(element => element.scrollLeft)).toBeGreaterThan(before)
  for (const name of ['Navigate', 'Find Us', 'Connect', 'Directions']) {
    const label = page.locator('footer').getByText(name, { exact: true })
    await expect(label).toBeVisible()
    const color = await renderedContrast(label)
    expect(color.flat).toBe(true)
    expect(color.ratio).toBeGreaterThanOrEqual(4.5)
  }
  expect(booking.runtimeErrors).toEqual([])
  expect(booking.mutations).toEqual([])
})

workspaceTest('staff signout retains its full target and standalone editing batches has one primary heading', async ({ workspace }) => {
  const { page } = workspace
  await workspace.open()
  for (const width of [768, 1440]) {
    await page.setViewportSize({ width, height: 1024 })
    const box = await page.getByRole('button', { name: 'Sign out', exact: true }).boundingBox()
    expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44)
  }
  await page.goto('/editor/queue')
  await expect(page.getByRole('heading', { name: 'Editing Batches', level: 1, exact: true })).toBeVisible()
  for (const width of [768, 1440]) {
    await page.setViewportSize({ width, height: 1024 })
    const box = await page.getByRole('button', { name: 'Sign out', exact: true }).boundingBox()
    expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
  }
  expect(workspace.mutations).toEqual([])
  expect(workspace.runtimeErrors).toEqual([])
})

portalTest('private portal stages retain 44px targets without overflow on phone and tablet', async ({ page, privatePortal: _privatePortal }) => {
  await page.goto(`/portal/${PRIVATE_PORTAL_ID}`)
  await page.getByRole('button', { name: 'Try Again', exact: true }).click()
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 1024 })
    for (const name of ['Photos', 'Free Prints', 'Add-ons', 'Review']) {
      const button = page.getByRole('button', { name, exact: true })
      await expect(button).toBeVisible()
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
  }
  // The fixture teardown verifies its own exact runtime-error and mutation lists.
  expect(_privatePortal.requests.length).toBeGreaterThan(0)
})
