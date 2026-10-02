import { test, expect, SYNTHETIC_PACKAGE } from './fixtures/booking-clarity'
import { BOOKING_CHOICE_DRAFT_KEY as key } from '../lib/booking-choice-draft'

test('refresh restores only package/date after explicit resume and freshly checks availability', async ({ booking }, testInfo) => {
  const { page } = booking
  await booking.open()
  await page.getByRole('button', { name: /October 2, 2026/ }).click()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByLabel('Full Name', { exact: false }).fill('Private draft contact')
  await page.getByLabel('Email Address *', { exact: true }).fill('private@example.test')
  const raw = await page.evaluate(key => localStorage.getItem(key), key)
  expect(JSON.parse(raw!)).toEqual({ version: 1, packageId: SYNTHETIC_PACKAGE.id, date: '2026-10-02', savedAt: expect.any(Number) })
  expect(raw).not.toContain('Private draft contact'); expect(raw).not.toContain('private@example.test')
  booking.failAvailability(true)
  // Full navigation without a package deep-link exercises recovery, not query preselection.
  await page.goto('/')
  await page.getByRole('button', { name: 'Reserve Your Session', exact: true }).click()
  const draft = page.getByRole('region', { name: 'Saved booking choices' })
  await expect(draft).toBeVisible()
  await draft.getByRole('button', { name: 'Resume choices' }).click()
  await expect(page.getByRole('heading', { name: '2. Date', exact: true })).toBeVisible()
  await expect(page.getByText('We couldn’t check current dates and slots. Please retry before choosing a date.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled()
  booking.failAvailability(false)
  await page.getByRole('button', { name: 'Retry availability' }).click()
  await expect(page.getByRole('button', { name: /October 2, 2026/ })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.getByLabel('Full Name', { exact: false })).toHaveValue('')
  await expect(page.getByLabel('Email Address *', { exact: true })).toHaveValue('')
  await page.screenshot({ path: testInfo.outputPath('booking-resumed-private-fields-empty.png') })
  expect(booking.mutations).toEqual([]); expect(booking.runtimeErrors).toEqual([])
})

test('discard removes saved choices and direct package links retain precedence', async ({ booking }) => {
  const { page } = booking
  await booking.open()
  await page.getByRole('button', { name: /October 2, 2026/ }).click()
  await page.goto('/')
  await page.getByRole('button', { name: 'Reserve Your Session', exact: true }).click()
  const draft = page.getByRole('region', { name: 'Saved booking choices' })
  await expect(draft).toBeVisible()
  await draft.getByRole('button', { name: 'Discard', exact: true }).click()
  await expect(draft).toHaveCount(0)
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBeNull()
  await booking.open()
  await expect(page.getByRole('heading', { name: '2. Date', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /October 2, 2026/ })).toHaveAttribute('aria-pressed','false')
  expect(booking.mutations).toEqual([]); expect(booking.runtimeErrors).toEqual([])
})

test('a draft that expires while the page is open cannot be resumed', async ({ booking }) => {
  const { page } = booking
  await booking.open()
  await page.getByRole('button', { name: /October 2, 2026/ }).click()
  await page.goto('/')
  await page.getByRole('button', { name: 'Reserve Your Session', exact: true }).click()
  const draft = page.getByRole('region', { name: 'Saved booking choices' })
  await expect(draft).toBeVisible()
  await page.clock.setSystemTime(new Date('2026-10-01T05:01:00Z'))
  await draft.getByRole('button', { name: 'Resume choices' }).click()
  await expect(draft).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '1. Select Your Package', exact: true })).toBeVisible()
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBeNull()
  expect(booking.mutations).toEqual([]); expect(booking.runtimeErrors).toEqual([])
})

test('remembering choices can be turned off without preventing an ordinary booking', async ({ booking }) => {
  const { page } = booking
  await booking.open(false)
  await page.getByRole('checkbox', { name: /Remember only my package and date/ }).uncheck()
  await page.getByRole('button', { name: 'creative', exact: true }).click()
  await page.getByRole('button', { name: /Synthetic Creative Package/ }).click()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByRole('button', { name: /October 2, 2026/ }).click()
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeEnabled()
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBeNull()
  expect(booking.mutations).toEqual([]); expect(booking.runtimeErrors).toEqual([])
})
