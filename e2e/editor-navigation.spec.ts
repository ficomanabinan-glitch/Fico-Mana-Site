import { test, expect, editorPaths } from './fixtures/editor-service-recovery'

const allRoutes = ['/editor', '/editor/onsite', '/editor/filtering', '/editor/queue', '/editor/upload', '/editor/client-portals', '/editor/files']

for (const role of ['onsite', 'editor', 'admin'] as const) {
  test(`${role} navigation preserves lifecycle order, permissions and mobile menu behavior`, async ({ page, editorRead }) => {
    editorRead.configure('onsite', 'empty')
    await page.route('**/api/editor-workflow/session', async route => {
      expect(route.request().method()).toBe('GET')
      await route.fulfill({ json: {
        user: { id: 'client-workspace-test', email: 'editor.qa@example.com', displayName: 'Synthetic Editor' },
        workspace: { name: 'Synthetic Studio' }, role,
        capabilities: { onsite: true, edit: role !== 'onsite', admin: role === 'admin' },
      } })
    })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(editorPaths.onsite)
    const desktop = page.locator('aside').getByRole('navigation', { name: 'Workspace navigation' })
    const routes = role === 'onsite' ? allRoutes.slice(0, 2) : allRoutes
    await expect(desktop.getByRole('link')).toHaveCount(routes.length)
    expect(await desktop.getByRole('link').evaluateAll(links => links.map(link => link.getAttribute('href')))).toEqual(routes)
    await expect(desktop.getByRole('link', { name: 'Onsite Upload', exact: true })).toHaveAttribute('aria-current', 'page')
    await expect(page.locator('aside').getByRole('link', { name: 'Open Admin Console' })).toHaveCount(role === 'admin' ? 1 : 0)

    await page.setViewportSize({ width: 390, height: 844 })
    const toggle = page.getByRole('button', { name: 'Toggle navigation' })
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const mobile = page.locator('#editor-mobile-navigation')
    await expect(mobile.getByRole('navigation').getByRole('link')).toHaveCount(routes.length)
    expect(await mobile.getByRole('navigation').getByRole('link').evaluateAll(links => links.map(link => link.getAttribute('href')))).toEqual(routes)
    await expect(mobile.getByRole('link', { name: 'Dashboard', exact: true })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(mobile).toHaveCount(0)
    await toggle.click()
    await mobile.getByRole('link', { name: 'Onsite Upload', exact: true }).click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(mobile).toHaveCount(0)
  })
}
