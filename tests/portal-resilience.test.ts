import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('client portal keeps essential booking content available when optional reads fail', async () => {
  const workflow = await readFile('lib/editor-workflow.ts', 'utf8')

  assert.match(workflow, /const warnings: string\[\] = \[\]/)
  assert.match(workflow, /Client portal \$\{label\} read failed/)
  assert.match(workflow, /warnings: \[\.\.\.new Set\(warnings\)\]/)
  assert.doesNotMatch(workflow, /if \(catalogResult\.error\) throw/)
  assert.doesNotMatch(workflow, /Selection details unavailable/)
})

test('portal unavailable state includes a solution and a retry button', async () => {
  const portal = await readFile('app/portal/[id]/page.tsx', 'utf8')

  assert.match(portal, /Try: refresh this page/)
  assert.match(portal, />Try Again</)
  assert.match(portal, /onRetry=\{\(\)=>void load\(0\)\}/)
  assert.match(portal, /Some project details are temporarily unavailable/)
})
