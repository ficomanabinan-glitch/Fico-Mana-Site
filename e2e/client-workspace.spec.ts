import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { test, expect, CLIENT_ID, OTHER_CLIENT_ID, FIRST_BOOKING, SECOND_BOOKING, OTHER_BOOKING, PENDING_BOOKING, CLIENT_NAME } from './fixtures/client-workspace'

const field = (page: Page, name: string) => page.locator('dt').filter({ hasText: new RegExp(`^${name}$`) }).locator('..').locator('dd')
const expand = async (page: Page, title: string) => {
  const summary = page.locator('summary').filter({ hasText: new RegExp(`^${title}›$`) })
  if (await summary.locator('..').getAttribute('open') === null) await summary.click()
}

/** SC-001 / REQ2, REQ5, REQ7: identity and booking context must change together, never guessed by name. */
test('client workspace keeps linked booking history and context without exposing portal credentials', async ({ workspace }) => {
  const { page } = workspace
  await workspace.open()
  const region = page.getByRole('region', { name: 'Client workspace', exact: true })
  const booking = page.getByLabel('Booking · 2 linked to this client', { exact: true })
  await expect(booking).toHaveValue(FIRST_BOOKING)
  await expect(booking.locator('option')).toHaveCount(2)
  await expect(booking.locator('option').nth(1)).toContainText(SECOND_BOOKING)
  await expect(region).not.toContainText(OTHER_BOOKING)
  await expect(field(page, 'FM reference')).toHaveText(FIRST_BOOKING)
  await expect(field(page, 'Verified / recorded paid')).toHaveText('₱500.00')
  await expect(field(page, 'Package balance')).toHaveText('₱3,000.00')
  await booking.selectOption(SECOND_BOOKING)
  await expect(page).toHaveURL(`/admin/clients/${CLIENT_ID}?booking=${SECOND_BOOKING}`)
  await expect(page.getByRole('heading', { name: CLIENT_NAME, exact: true })).toBeVisible()
  await expect(field(page, 'FM reference')).toHaveText(SECOND_BOOKING)
  await expect(field(page, 'Package')).toHaveText('Capping and Pinning Photoshoot')
  await expand(page, 'Production and files')
  await expect(field(page, 'Included choices')).toHaveText('2 / 2')
  for (const [label, path] of [['Manage booking', '/admin/bookings'], ['Payment history', '/admin/bookings']]) {
    const href = await page.getByRole('link', { name: label, exact: true }).getAttribute('href')
    const destination = new URL(href!, 'http://127.0.0.1:3200')
    expect(destination.pathname).toBe(path)
    expect(destination.searchParams.get('search')).toBe(SECOND_BOOKING)
    expect(destination.searchParams.get('return')).toBe(`/admin/clients/${CLIENT_ID}?booking=${SECOND_BOOKING}`)
    if (label === 'Payment history') expect(destination.searchParams.get('details')).toBe(SECOND_BOOKING)
  }
  const filesHref = await page.getByRole('link', { name: 'Files for this booking', exact: true }).getAttribute('href')
  expect(new URL(filesHref!, 'http://127.0.0.1:3200').searchParams.get('booking')).toBe(SECOND_BOOKING)
  expect(new URL(filesHref!, 'http://127.0.0.1:3200').searchParams.get('return')).toBe(`/admin/clients/${CLIENT_ID}?booking=${SECOND_BOOKING}`)
  await expand(page, 'Portal and delivery')
  await expect(page.getByRole('link', { name: 'Open client portal', exact: true })).toHaveAttribute('href', `/api/bookings/${SECOND_BOOKING}/portal`)
  await expect(region).not.toContainText('SECRET_PIN')
  expect(await region.locator('a').evaluateAll(links => links.map(link => link.getAttribute('href')))).not.toEqual(expect.arrayContaining([expect.stringMatching(/[?&](sig|pin|token)=/i)]))
  expect(workspace.reads.filter(read => read.section === 'details').map(read => read.booking)).toEqual(expect.arrayContaining([FIRST_BOOKING, SECOND_BOOKING]))
  expect(workspace.mutations).toEqual([])
  expect(workspace.runtimeErrors).toEqual([])
})

test('payment action keeps a pending receipt in verification and opens paid history in booking details', async ({ workspace }) => {
  const { page } = workspace
  await workspace.open(FIRST_BOOKING)
  await expect(page.getByRole('link', { name: 'Review payment', exact: true })).toHaveCount(0)
  const history = page.getByRole('link', { name: 'Payment history', exact: true })
  await expect(history).toHaveAttribute('href', new RegExp(`/admin/bookings\\?search=${FIRST_BOOKING}&details=${FIRST_BOOKING}`))
  await history.click()
  await expect(page).toHaveURL(new RegExp(`/admin/bookings\\?search=${FIRST_BOOKING}&details=${FIRST_BOOKING}`))
  await expect(page.getByRole('dialog').getByText(`Ref: ${FIRST_BOOKING}`, { exact: true })).toBeVisible()
  await workspace.open(PENDING_BOOKING)
  const receipt = page.getByRole('link', { name: 'Review receipt', exact: true }).first()
  await expect(receipt).toHaveAttribute('href', new RegExp(`/admin/verification\\?search=${PENDING_BOOKING}`))
  await expect(page.getByRole('link', { name: 'Payment history', exact: true })).toHaveCount(0)
  await receipt.click()
  await expect(page).toHaveURL(new RegExp(`/admin/verification\\?search=${PENDING_BOOKING}`))
  await expect(page.getByRole('button', { name: new RegExp(`View receipt for .* ${PENDING_BOOKING}`) })).toBeVisible()
  expect(workspace.mutations).toEqual([])
})

test('selection review opens the chosen booking in the editor queue', async ({ workspace }) => {
  const { page } = workspace
  await workspace.open(FIRST_BOOKING)
  await expand(page, 'Production and files')
  await page.locator('summary').filter({ hasText: /^Selection and editing workflows$/ }).click()
  await page.getByRole('link', { name: 'Review selections', exact: true }).click()
  await expect(page).toHaveURL(url => url.pathname === '/editor/filtering'
    && url.searchParams.get('search') === FIRST_BOOKING && url.searchParams.get('tab') === 'queue')
  const search = page.getByRole('textbox', { name: 'Search photo selections', exact: true })
  await expect(search).toHaveValue(FIRST_BOOKING)
  await expect(page.getByText(FIRST_BOOKING, { exact: true }).first()).toBeVisible()
  await expect(page.getByText(OTHER_BOOKING, { exact: true })).toHaveCount(0)
  expect(workspace.mutations).toEqual([])
  expect(workspace.runtimeErrors).toEqual([])
})

test('identity appears once on arrival and remains available when the record is scrolled', async ({ workspace }) => {
  const { page } = workspace
  await page.setViewportSize({ width: 390, height: 844 })
  await workspace.open()
  const context = page.getByRole('group', { name: 'Current client and booking', exact: true })
  await expect(page.getByRole('heading', { name: CLIENT_NAME, exact: true })).toBeVisible()
  await expect(context).not.toContainText(CLIENT_NAME)
  await expect(context.getByRole('link', { name: 'All clients', exact: true })).toBeVisible()
  await page.getByRole('main').evaluate(element => { element.scrollTop = element.scrollHeight })
  await expect(context).toContainText(CLIENT_NAME)
  await expect(context).toContainText(FIRST_BOOKING)
})

/** SC-002 / REQ1, REQ6: distinguish similar names and support real keyboard navigation/focus restoration. */
test('shared search separates same-name clients and works by keyboard', async ({ workspace }, testInfo) => {
  const { page } = workspace
  await workspace.open()
  const trigger = page.getByRole('button', { name: 'Search clients', exact: true })
  await trigger.focus(); await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Search clients', exact: true })
  await expect(dialog).toBeVisible()
  const input = dialog.getByRole('searchbox', { name: 'Find a client or booking', exact: true })
  await expect(input).toBeFocused()
  await input.fill('Ana')
  const first = dialog.getByRole('link').filter({ hasText: FIRST_BOOKING })
  const other = dialog.getByRole('link').filter({ hasText: OTHER_BOOKING })
  await expect(first).toBeVisible(); await expect(other).toBeVisible()
  await expect(first).toContainText('ana.maria@example.test')
  await expect(other).toContainText('other.ana@example.test')
  await expect(first).toHaveAttribute('href', `/admin/clients/${CLIENT_ID}?booking=${FIRST_BOOKING}`)
  await expect(other).toHaveAttribute('href', `/admin/clients/${OTHER_CLIENT_ID}?booking=${OTHER_BOOKING}`)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused()
  await page.keyboard.press('Enter'); await expect(dialog).toBeVisible()
  await input.fill('Ana'); await expect(first).toBeVisible()
  await input.press('Tab'); await expect(first).toBeFocused()
  await page.keyboard.press('Tab'); await expect(other).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(`/admin/clients/${OTHER_CLIENT_ID}?booking=${OTHER_BOOKING}`)
  await expect(page.getByText('other.ana@example.test', { exact: false }).first()).toBeVisible()
  await expect(page.getByLabel('Booking · 1 linked to this client', { exact: true }).locator('option')).toHaveCount(1)
  await expect(dialog).toHaveCount(0)
  await page.goto('/admin/clients')
  await expect(page.getByRole('heading', { name: 'Clients', exact: true })).toBeVisible()
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport)
    const links = page.getByRole('link', { name: 'Open workspace', exact: true })
    await expect(links).toHaveCount(2)
    expect(await links.evaluateAll(elements => elements.map(element => element.getAttribute('href')))).toEqual(expect.arrayContaining([
      `/admin/clients/${CLIENT_ID}?booking=${SECOND_BOOKING}`,
      `/admin/clients/${OTHER_CLIENT_ID}?booking=${OTHER_BOOKING}`,
    ]))
    await expect(page.getByRole('table')).toHaveCount(viewport.width === 390 ? 0 : 1)
    expect(await page.getByRole('main').evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
    await page.screenshot({ path: testInfo.outputPath(`client-list-${viewport.width}.png`) })
  }
  expect(workspace.mutations).toEqual([])
})

/** SC-003 / REQ1: failures must not masquerade as empty search results or discard the user's query. */
test('search distinguishes a service failure from no matches and retries without losing the query', async ({ workspace }) => {
  const { page } = workspace
  await workspace.open(); workspace.failSearch()
  await page.getByRole('button', { name: 'Search clients', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Search clients', exact: true })
  const input = dialog.getByRole('searchbox', { name: 'Find a client or booking', exact: true })
  await input.fill('Ana')
  await expect(dialog.getByRole('alert')).toContainText('Client search could not be loaded')
  await expect(dialog.getByText('No clients found.', { exact: false })).toHaveCount(0)
  await expect(input).toHaveValue('Ana')
  await dialog.getByRole('button', { name: 'Retry search', exact: true }).click()
  await expect(dialog.getByRole('link').filter({ hasText: FIRST_BOOKING })).toBeVisible()
  await input.fill('nomatch')
  await expect(dialog.getByText('No clients found. Try their FM reference, email, or phone instead.', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('alert')).toHaveCount(0)
})

/** SC-004 / REQ3: slow details cannot block identity, booking context, or existing workflow actions. */
test('core information remains usable while production and payment details are pending', async ({ workspace }, testInfo) => {
  const { page } = workspace
  const held = workspace.holdDetails()
  try {
    await workspace.open(); await held.requested
    await expect(page.getByLabel('Booking · 2 linked to this client', { exact: true })).toBeEnabled()
    await expect(field(page, 'FM reference')).toHaveText(FIRST_BOOKING)
    await expect(page.getByRole('link', { name: 'Manage booking', exact: true })).toBeVisible()
    await expect(page.getByText('Checking production and file details… Booking information is available now.', { exact: true })).toBeVisible()
    await expect(field(page, 'Verified / recorded paid')).toHaveCount(0)
    await expand(page, 'Lifecycle · booking to delivery')
    const lifecycle = page.getByRole('list', { name: 'Client workflow lifecycle', exact: true })
    await expect(lifecycle.getByRole('listitem')).toHaveCount(9)
    await expect(lifecycle.getByRole('listitem').filter({ hasText: '4. Originals' })).toContainText('Not checked')
    await expect(lifecycle.getByRole('listitem').filter({ hasText: '8. Enhanced upload' })).toContainText('Not checked')
  } finally { held.release() }
  await expect(field(page, 'Verified / recorded paid')).toHaveText('₱500.00')
  await expect(page.getByText('Checking production and file details… Booking information is available now.', { exact: true })).toHaveCount(0)
  const lifecycle = page.getByRole('list', { name: 'Client workflow lifecycle', exact: true })
  await expect(lifecycle.getByRole('listitem').filter({ hasText: '4. Originals' })).toContainText('Recorded')
  const editingStage = lifecycle.getByRole('listitem').filter({ hasText: '7. Editing' })
  await expect(editingStage).toContainText('Recorded')
  await expect(editingStage).toContainText('Current task · Open editing batch')
  await expect(editingStage).toContainText('An editing-start milestone is recorded. Current job status: READY_FOR_EDITING.')
  await expect(editingStage).not.toContainText('editing has not started')
  await expect(editingStage).toHaveAttribute('aria-current', 'step')
  await expect(lifecycle.getByRole('listitem').filter({ hasText: '8. Enhanced upload' })).toContainText('Awaiting record')
  await page.getByRole('heading', { name: CLIENT_NAME, exact: true }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('client-workspace-lifecycle-top.png') })
  for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport)
    await page.locator('summary').filter({ hasText: /^Lifecycle · booking to delivery›$/ }).evaluate(element => element.scrollIntoView({ block: 'start' }))
    await expect(lifecycle).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath(`client-workspace-expanded-lifecycle-${viewport.width}.png`) })
  }
})

/** SC-005 / REQ4: partial failure is independent, unknown is not zero, and retry restores the failed section. */
test('unavailable file counts do not hide known payments or selections and recover independently', async ({ workspace }, testInfo) => {
  const { page } = workspace
  workspace.unavailableFiles(true); await workspace.open()
  await expect(field(page, 'Verified / recorded paid')).toHaveText('₱500.00')
  await expand(page, 'Production and files')
  await expect(page.getByText('File counts are temporarily unavailable. Retry details; other records remain usable.', { exact: true })).toBeVisible()
  await expect(field(page, 'Original photos')).toHaveCount(0)
  await expect(field(page, 'Included choices')).toHaveText('5 / 5')
  await expect(page.getByRole('listitem').filter({ hasText: `SYNTHETIC-${FIRST_BOOKING}.JPG` })).toBeVisible()
  const notice = page.getByRole('alert').filter({ hasText: 'File counts are temporarily unavailable.' })
  const localRetry = notice.locator('..').getByRole('button', { name: 'Retry additional details', exact: true })
  await expect(localRetry).toBeVisible()
  expect((await localRetry.boundingBox())?.height).toBeGreaterThanOrEqual(44)
  await expect(page.getByRole('button', { name: 'Retry details', exact: true })).toHaveCount(1)
  await expect(page.getByRole('link', { name: 'Onsite upload', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Files for this booking', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Editing queue', exact: true })).toHaveCount(0)
  // Native summary is the user-facing control for the progressive workflow disclosure.
  await page.locator('summary').filter({ hasText: /^Selection and editing workflows$/ }).click()
  for (const label of ['Review selections', 'Editing queue', 'Editing batch', 'Upload enhanced photos']) {
    await expect(page.getByRole('link', { name: label, exact: true })).toBeVisible()
  }
  await page.screenshot({ path: testInfo.outputPath('client-workspace-partial-failure.png') })
  workspace.unavailableFiles(false)
  await localRetry.click()
  await expect(field(page, 'Original photos')).toHaveText('115')
  await expect(page.getByText('File counts are temporarily unavailable.', { exact: false })).toHaveCount(0)
  await expect(localRetry).toHaveCount(0)
  await expect(field(page, 'Package balance')).toHaveText('₱3,000.00')
})

/** SC-006 / REQ3, REQ4: transport failure must retain the core record, then retry in place. */
test('a details transport failure preserves the client core and recovers without a full-page refresh', async ({ workspace }) => {
  const { page } = workspace
  workspace.failDetails(); await workspace.open()
  const clientRegion = page.getByRole('region', { name: 'Client workspace', exact: true })
  await expect(clientRegion.getByRole('alert')).toContainText('Some details could not be loaded')
  await expect(field(page, 'FM reference')).toHaveText(FIRST_BOOKING)
  await expect(page.getByRole('link', { name: 'Manage booking', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Retry details', exact: true }).click()
  await expect(field(page, 'Verified / recorded paid')).toHaveText('₱500.00')
  await expect(clientRegion.getByRole('alert')).toHaveCount(0)
})

/** SC-007 / REQ2: unavailable core cannot be confused with a missing client or generic empty dashboard. */
test('a core failure offers an explicit retry and never invents client details', async ({ workspace }) => {
  const { page } = workspace
  workspace.failCore()
  await page.goto(`/admin/clients/${CLIENT_ID}?booking=${FIRST_BOOKING}`)
  await expect(page.getByRole('heading', { name: 'Client workspace unavailable', exact: true })).toBeVisible()
  await expect(page.getByRole('main').getByRole('alert')).toHaveText('Synthetic workspace unavailable')
  await expect(page.getByRole('heading', { name: CLIENT_NAME, exact: true })).toHaveCount(0)
  workspace.recoverCore()
  await page.getByRole('button', { name: 'Retry workspace', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Client workspace', exact: true })).toBeVisible()
  await expect(field(page, 'FM reference')).toHaveText(FIRST_BOOKING)
})

/** SC-008 / REQ6: scans are scoped to real loaded content; screenshots are evidence, not approval. */
test('workspace and search fit phone, tablet and desktop widths with no serious automated accessibility findings', async ({ workspace }, testInfo) => {
  const { page } = workspace
  await workspace.open(); await expect(field(page, 'Package balance')).toHaveText('₱3,000.00')
  for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport)
    for (const title of ['Production and files', 'Portal and delivery', 'Activity']) {
      const summary = page.locator('summary').filter({ hasText: new RegExp(`^${title}›$`) })
      if (await summary.locator('..').getAttribute('open') !== null) await summary.click()
    }
    await page.getByRole('main').evaluate(element => { element.scrollTop = 0 })
    await page.screenshot({ path: testInfo.outputPath(`client-workspace-first-screen-${viewport.width}.png`) })
    for (const title of ['Production and files', 'Portal and delivery', 'Activity']) await expand(page, title)
    await expect(page.getByRole('heading', { name: CLIENT_NAME, exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    expect(await page.getByRole('main').evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
    const workspaceScan = await new AxeBuilder({ page }).include('[aria-label="Client workspace"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
    await testInfo.attach(`client-workspace-axe-${viewport.width}`, { body: JSON.stringify({
      viewport, violations: workspaceScan.violations, incomplete: workspaceScan.incomplete,
      passes: workspaceScan.passes.length,
    }), contentType: 'application/json' })
    expect(workspaceScan.violations.filter(issue => ['serious', 'critical'].includes(issue.impact || ''))).toEqual([])
    await page.screenshot({ path: testInfo.outputPath(`client-workspace-${viewport.width}.png`), fullPage: true })
    await page.getByRole('main').evaluate(element => { element.scrollTop = element.scrollHeight })
    const stickyContext = page.locator('[aria-label="Current client and booking"]')
    await expect(stickyContext).toBeVisible()
    await expect(stickyContext).toContainText(CLIENT_NAME)
    await expect(stickyContext).toContainText(FIRST_BOOKING)
    const contextBox = await stickyContext.boundingBox()
    const mainBox = await page.getByRole('main').boundingBox()
    expect(contextBox!.y).toBeGreaterThanOrEqual(mainBox!.y)
    expect(contextBox!.y + contextBox!.height).toBeLessThanOrEqual(mainBox!.y + mainBox!.height)
    await page.screenshot({ path: testInfo.outputPath(`client-workspace-scrolled-${viewport.width}.png`) })
    await page.getByRole('button', { name: 'Search clients', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Search clients', exact: true })
    await dialog.getByRole('searchbox', { name: 'Find a client or booking', exact: true }).fill('Ana')
    await expect(dialog.getByRole('link').filter({ hasText: FIRST_BOOKING })).toBeVisible()
    const dialogBox = await dialog.boundingBox()
    expect(dialogBox!.x).toBeGreaterThanOrEqual(0)
    expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(viewport.width + 1)
    expect(await dialog.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
    const dialogScan = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
    await testInfo.attach(`client-search-axe-${viewport.width}`, { body: JSON.stringify({
      viewport, violations: dialogScan.violations, incomplete: dialogScan.incomplete,
      passes: dialogScan.passes.length,
    }), contentType: 'application/json' })
    expect(dialogScan.violations.filter(issue => ['serious', 'critical'].includes(issue.impact || ''))).toEqual([])
    await page.screenshot({ path: testInfo.outputPath(`client-search-${viewport.width}.png`) })
    await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0)
  }
  expect(workspace.runtimeErrors).toEqual([])
  expect(workspace.blockedExternalRequests).toEqual([])
  await testInfo.attach('client-workspace-runtime-evidence', { body: JSON.stringify({
    runtimeErrors: workspace.runtimeErrors, blockedExternalRequests: workspace.blockedExternalRequests,
    mutations: workspace.mutations, reads: workspace.reads,
  }), contentType: 'application/json' })
})

/** SC-010 / REQ3: genuine first-run setup requires a successful empty bookings response. */
test('an authoritative empty dashboard offers a clear studio setup step', async ({ workspace }, testInfo) => {
  workspace.dashboardMode('empty')
  const { page } = workspace
  await page.goto('/admin/dashboard')
  await expect(page.getByRole('heading', { name: 'Start with studio readiness', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Check system setup', exact: true })).toHaveAttribute('href', '/admin/system')
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('admin-first-run.png') })
  expect(workspace.mutations).toEqual([])
})

/** SC-011 / REQ4: read failures must not be sold as first-run onboarding or successful zero counts. */
test('a failed dashboard bookings read is not presented as a first-run studio', async ({ workspace }, testInfo) => {
  workspace.dashboardMode('failed')
  const { page } = workspace
  await page.goto('/admin/dashboard')
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Booking statistics could not be refreshed')
  await expect(page.getByRole('button', { name: 'Retry dashboard', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Start with studio readiness', exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Check system setup', exact: true })).toHaveCount(0)
  const main = page.getByRole('main')
  await expect(main.getByRole('heading', { name: /^(?:₱)?0(?:\.00)?$/, exact: true })).toHaveCount(0)
  await expect(main.getByText('No sessions booked for today', { exact: true })).toHaveCount(0)
  await expect(main.getByText('No payments this week', { exact: true })).toHaveCount(0)
  await expect(main.locator('[title="₱0"]')).toHaveCount(0)
  await expect(main.getByText('0 Active', { exact: true })).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('admin-dashboard-read-failure.png') })
  expect(workspace.mutations).toEqual([])
})

/** SC-012 / REQ5: authoritative production attention opens the correct client/booking context. */
test('production attention points to the related client workspace', async ({ workspace }) => {
  workspace.dashboardMode('attention')
  const { page } = workspace
  await page.goto('/admin/dashboard')
  const actionCenter = page.getByRole('region', { name: 'Action center', exact: true })
  await expect(actionCenter).toBeVisible()
  const task = actionCenter.getByRole('listitem').filter({ hasText: 'Synthetic portal provisioning issue requires attention.' })
  const link = task.getByRole('link', { name: 'Open client', exact: true })
  await expect(link).toHaveAttribute('href', `/admin/clients/${CLIENT_ID}?booking=${SECOND_BOOKING}`)
  await link.click()
  await expect(page.getByRole('region', { name: 'Client workspace', exact: true })).toBeVisible()
  await expect(field(page, 'FM reference')).toHaveText(SECOND_BOOKING)
  expect(workspace.mutations).toEqual([])
})

/** SC-009 / REQ5, REQ6: the familiar booking drawer stays usable when entered from Client 360. */
test('booking drawer retains a return path and nested confirmations keep focus without mutating records', async ({ workspace }, testInfo) => {
  const { page } = workspace
  await workspace.open()
  await page.getByRole('link', { name: 'Manage booking', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Booking Management', exact: true })).toBeVisible()
  const returnLink = page.getByRole('link', { name: 'Back to client workspace', exact: true })
  await expect(returnLink).toHaveAttribute('href', `/admin/clients/${CLIENT_ID}?booking=${FIRST_BOOKING}`)
  const row = page.getByRole('row').filter({ has: page.getByRole('cell', { name: FIRST_BOOKING, exact: true }) })
  const view = row.getByRole('button', { name: `View details for ${CLIENT_NAME} ${FIRST_BOOKING}`, exact: true })
  await view.click()
  const drawer = page.getByRole('dialog', { name: CLIENT_NAME, exact: true })
  await expect(drawer).toBeVisible()
  expect(await drawer.evaluate(element => element.contains(document.activeElement))).toBe(true)
  // Native modal dialogs must stop programmatic background focus as well as normal tabbing.
  await page.getByRole('button', { name: 'Search clients', exact: true, includeHidden: true }).evaluate(element => (element as HTMLElement).focus())
  expect(await drawer.evaluate(element => element.contains(document.activeElement))).toBe(true)
  await drawer.getByRole('button', { name: 'Complete', exact: true }).click()
  const confirmation = page.getByRole('dialog', { name: 'Complete Session', exact: true })
  await expect(confirmation).toBeVisible()
  await expect(confirmation.getByLabel('Client Full Name', { exact: true })).toHaveValue(CLIENT_NAME)
  expect(await confirmation.evaluate(element => element.contains(document.activeElement))).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('booking-complete-confirmation.png') })
  await page.keyboard.press('Escape')
  await expect(confirmation).toHaveCount(0)
  await expect(drawer).toBeVisible()
  await expect(drawer.getByRole('button', { name: 'Complete', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(drawer).toHaveCount(0); await expect(view).toBeFocused()
  await returnLink.click()
  await expect(page.getByRole('region', { name: 'Client workspace', exact: true })).toBeVisible()
  expect(workspace.mutations).toEqual([])
  expect(workspace.runtimeErrors).toEqual([])
})
