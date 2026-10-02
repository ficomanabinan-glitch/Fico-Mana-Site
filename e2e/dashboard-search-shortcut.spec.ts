import { test, expect } from './fixtures/client-workspace'

test('dashboard shortcut opens the shared search sheet and restores its own keyboard focus', async ({ workspace }) => {
  const { page } = workspace
  await workspace.open()
  await page.goto('/admin/dashboard')
  const shortcut = page.getByRole('button', { name: 'Open client search', exact: true })
  await expect(shortcut).toBeVisible()
  await expect(page.getByRole('searchbox', { name: 'Find a client or booking', exact: true })).toHaveCount(0)
  await shortcut.focus(); await shortcut.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Search clients', exact: true })
  await expect(dialog.getByRole('searchbox', { name: 'Find a client or booking', exact: true })).toBeFocused()
  await expect(page.getByRole('searchbox', { name: 'Find a client or booking', exact: true })).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(shortcut).toBeFocused()
  const header = page.getByRole('button', { name: 'Search clients', exact: true })
  await header.focus(); await header.press('Enter')
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(header).toBeFocused()
  expect(workspace.mutations).toEqual([])
  expect(workspace.runtimeErrors).toEqual([])
})
