import { test, expect } from './fixtures/booking-clarity'

test('graduation school and course fields have working visible labels', async ({ booking }, testInfo) => {
  const { page } = booking
  booking.useGraduation()
  await booking.open()
  await expect(page.getByRole('heading', { name: '2. Date', exact: true })).toBeVisible()
  const chosenDate = page.getByRole('button', { name: /October 2, 2026/ })
  for (const width of [390, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
    const previousMonth = await page.getByRole('button', { name: 'Previous month', exact: true }).boundingBox()
    expect(Math.round(previousMonth!.height)).toBeGreaterThanOrEqual(44)
    expect(Math.round(previousMonth!.width)).toBeGreaterThanOrEqual(44)
    const day = await chosenDate.boundingBox()
    expect(Math.round(day!.height), `date height at ${width}`).toBeGreaterThanOrEqual(44)
    expect(Math.round(day!.width), `date width at ${width}`).toBeGreaterThanOrEqual(44)
    const calendar = chosenDate.locator('..')
    expect(await calendar.evaluate(element => element.scrollWidth - element.clientWidth), `calendar overflow at ${width}`).toBeLessThanOrEqual(1)
    await page.screenshot({ path: testInfo.outputPath(`booking-calendar-${width}.png`) })
  }
  await chosenDate.click()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.getByRole('heading', { name: '3. Details', exact: true })).toBeVisible()
  const school = page.getByRole('textbox', { name: 'School Name', exact: true })
  const course = page.getByRole('textbox', { name: 'Course', exact: true })
  await expect(school).toBeVisible()
  await expect(course).toBeVisible()
  await page.getByText('School Name', { exact: true }).click()
  await expect(school).toBeFocused()
  await page.getByText('Course', { exact: true }).click()
  await expect(course).toBeFocused()
  expect(booking.mutations).toEqual([])
  expect(booking.runtimeErrors).toEqual([])
})

// SC-1/REQ-1,2: walk only as far as receipt selection; never submit a booking.
test('non-graduation progress and receipt selection work with keyboard input', async ({ booking, isMobile }, testInfo) => {
  const { page } = booking
  await page.setViewportSize(isMobile ? { width: 390, height: 844 } : { width: 1440, height: 900 })
  await booking.open()
  await expect(page.getByRole('heading', { name: '2. Date', exact: true })).toBeVisible()
  const progress = page.getByRole('list', { name: 'Booking progress' })
  await expect(progress.getByRole('listitem')).toHaveCount(4)
  await page.screenshot({ path: testInfo.outputPath('booking-progress.png') })
  const date = page.getByRole('button', { name: /October 2, 2026/ })
  await expect(date).toHaveAttribute('aria-pressed', 'false')
  await date.click()
  await expect(date).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(progress.getByRole('listitem').nth(2)).toHaveAttribute('aria-current', 'step')
  await expect(page.getByRole('heading', { name: '3. Your Information' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '3. Your Information' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByLabel('Full Name', { exact: false })).toBeFocused()
  await page.getByLabel('Full Name', { exact: false }).fill('Synthetic Maya Santos')
  await page.getByLabel('Phone Number').fill('09170000001')
  await page.getByLabel('Email Address *', { exact: true }).fill('maya.santos@example.test')
  await page.getByLabel('Confirm Email Address').fill('maya.santos@example.test')
  await page.getByLabel('Facebook Profile Name').fill('Synthetic Maya Santos')
  await page.getByLabel('Facebook Profile Link').fill('https://facebook.com/synthetic.maya')
  await page.getByRole('button', { name: 'Proceed to Payment' }).click()
  const qrLink = page.getByRole('button', { name: 'View full QR image', exact: true })
  await expect(qrLink).toBeVisible()
  const qrContrast = await qrLink.evaluate(element => {
    const canvas = document.createElement('canvas')
    canvas.width = 1; canvas.height = 1
    const colorContext = canvas.getContext('2d', { willReadFrequently: true })!
    const rgba = (value: string) => {
      colorContext.clearRect(0, 0, 1, 1)
      colorContext.fillStyle = value
      colorContext.fillRect(0, 0, 1, 1)
      const channels = colorContext.getImageData(0, 0, 1, 1).data
      return [channels[0], channels[1], channels[2], channels[3] / 255]
    }
    const blend = (foreground: number[], background: number[]) => foreground.slice(0, 3).map((value, index) => value * foreground[3] + background[index] * (1 - foreground[3]))
    const layers: Array<{ color: string; image: string; opacity: string }> = []
    for (let parent: Element | null = element; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent)
      layers.push({ color: style.backgroundColor, image: style.backgroundImage, opacity: style.opacity })
    }
    let background = [255, 255, 255]
    let verifiedFlatBackground = true
    for (const layer of [...layers].reverse()) {
      background = blend(rgba(layer.color), background)
      if (layer.image !== 'none') {
        const stops = layer.image.match(/rgba?\([^)]+\)/g) || []
        // Equal opaque gradient stops are a flat color regardless of interpolation space.
        const colors = stops.map(rgba)
        if (!layer.image.startsWith('linear-gradient(') || colors.length < 2 || colors.some(color => color[3] !== 1 || color.some((value, index) => value !== colors[0][index]))) verifiedFlatBackground = false
        else background = blend(colors[0], background)
      }
    }
    const foreground = blend(rgba(getComputedStyle(element).color), background)
    const luminance = (color: number[]) => color.map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0)
    const first = luminance(foreground), second = luminance(background)
    return { foreground, background, ratio: (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05), layers, verifiedFlatBackground, height: element.getBoundingClientRect().height }
  })
  await testInfo.attach('payment-qr-contrast', { body: JSON.stringify(qrContrast), contentType: 'application/json' })
  // Canvas normalizes CSS Color 4/oklab values; only verified flat backgrounds are measured here.
  expect(qrContrast.verifiedFlatBackground).toBe(true)
  expect(qrContrast.layers.every(layer => layer.opacity === '1')).toBe(true)
  expect(qrContrast.ratio).toBeGreaterThanOrEqual(4.5)
  expect(qrContrast.height).toBeGreaterThanOrEqual(44)
  await page.getByLabel('BPI Transaction Reference (optional)', { exact: true }).fill('SYNTHETIC-REFERENCE')
  await expect(page.getByRole('button', { name: 'Submit Booking', exact: true })).toBeDisabled()
  const receipt = page.getByRole('button', { name: /^(Upload payment receipt \*|Change payment receipt)/ })
  await receipt.focus()
  await expect(receipt).toBeFocused()
  for (const key of ['Enter', 'Space']) {
    const chooserPromise = page.waitForEvent('filechooser')
    await receipt.press(key)
    const chooser = await chooserPromise
    await chooser.setFiles({ name: 'synthetic-bpi-receipt.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2K0AAAAASUVORK5CYII=', 'base64') })
    await expect(page.getByRole('button', { name: /Change payment receipt/ })).toContainText('synthetic-bpi-receipt.png')
    // The same semantic chooser retains keyboard access after selecting a file.
    if (key === 'Enter') await page.getByRole('button', { name: /Change payment receipt/ }).focus()
  }
  await expect(page.getByRole('button', { name: 'Submit Booking', exact: true })).toBeEnabled()
  await page.screenshot({ path: testInfo.outputPath('booking-receipt-keyboard.png') })
  // Geometry is a layout oracle, not a substitute for the role/label assertions above.
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
  if (!isMobile) {
    await page.setViewportSize({ width: 768, height: 1024 })
    await expect(receipt).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
    await page.screenshot({ path: testInfo.outputPath('booking-receipt-tablet.png') })
    const menu = page.getByRole('button', { name: 'Open menu', exact: true })
    await expect(menu).toBeVisible()
    await expect(page.getByRole('link', { name: 'Book Session', exact: true })).toHaveCount(0)
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: testInfo.outputPath('public-header-tablet.png') })
    await menu.click()
    const navigation = page.getByRole('dialog', { name: 'Navigation', exact: true })
    await expect(navigation).toBeVisible()
    await expect(navigation.getByRole('link', { name: 'Book Session', exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(navigation).toHaveCount(0)
    await expect(menu).toBeFocused()
  }
  expect(booking.mutations).toEqual([])
  expect(booking.runtimeErrors).toEqual([])
})

// SC-2/REQ-3: an availability failure cannot offer dates as if they were empty.
test('availability failure blocks dates and recovers through retry', async ({ booking }) => {
  const { page } = booking
  booking.failAvailability(true)
  await booking.open()
  const problem = page.getByRole('alert', { name: 'Availability check problem' })
  await expect(problem).toContainText('We couldn’t check current dates and slots')
  await expect(page.getByRole('button', { name: /October 2, 2026/ })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled()
  booking.failAvailability(false)
  await page.getByRole('button', { name: 'Retry availability' }).click()
  await expect(page.getByRole('button', { name: /October 2, 2026/ })).toBeEnabled()
  await page.getByRole('button', { name: /October 2, 2026/ }).click()
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeEnabled()
  await expect(problem).toHaveCount(0)
  expect(booking.mutations).toEqual([])
})

// SC-3/REQ-3: current catalog failure is distinct from no packages in a category.
test('catalog failure explains recovery instead of using a fallback package', async ({ booking }) => {
  const { page } = booking
  booking.failPackages(true)
  await booking.open(false)
  const problem = page.getByRole('alert', { name: 'Package loading problem' })
  await expect(problem).toContainText('We couldn’t load the current packages')
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled()
  booking.failPackages(false)
  await page.getByRole('button', { name: 'Retry packages' }).click()
  await page.getByRole('button', { name: 'creative', exact: true }).click()
  await page.getByRole('button', { name: /Synthetic Creative Package/ }).click()
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeEnabled()
  await expect(problem).toHaveCount(0)
  expect(booking.mutations).toEqual([])
})
