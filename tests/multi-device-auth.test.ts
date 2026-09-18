import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const sessionOwners = [
  'app/admin/actions.ts',
  'app/editor/actions.ts',
  'app/admin/layout.tsx',
  'components/editor-portal-shell.tsx',
  'components/new-admin/shell.tsx',
]

test('staff sign-out only ends the current device session', async () => {
  for (const file of sessionOwners) {
    const source = await readFile(file, 'utf8')
    assert.doesNotMatch(source, /\.auth\.signOut\(\)/, `${file} must not revoke other device sessions`)
    for (const call of source.matchAll(/\.auth\.signOut\(([^)]*)\)/g)) {
      assert.match(call[1] ?? '', /scope:\s*['"]local['"]/, `${file} sign-out must use local scope`)
    }
  }
})
