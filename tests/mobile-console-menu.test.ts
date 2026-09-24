import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('admin and editor mobile menus fill the available viewport and keep their final controls reachable', async () => {
  const [admin, editor] = await Promise.all([
    readFile('app/admin/layout.tsx', 'utf8'),
    readFile('components/editor-portal-shell.tsx', 'utf8'),
  ])

  for (const shell of [admin, editor]) {
    assert.match(shell, /absolute inset-x-0 bottom-0 top-14/)
    assert.match(shell, /overflow-y-auto overscroll-contain/)
    assert.match(shell, /pb-\[calc\(1rem\+env\(safe-area-inset-bottom,0px\)\)\]/)
    assert.doesNotMatch(shell, /max-h-\[65dvh\]/)
  }

  assert.match(admin, /id="admin-mobile-navigation"[\s\S]*?<DashboardSidebarProfile/)
  assert.match(editor, /id="editor-mobile-navigation"[\s\S]*?<DashboardSidebarProfile/)
})
