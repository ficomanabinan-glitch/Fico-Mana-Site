import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('portal loading uses the requested message without changing its styling', async () => {
  const portal = await readFile('app/portal/[id]/page.tsx', 'utf8')
  assert.ok(portal.includes('if(loading)return <main className="flex min-h-screen items-center justify-center bg-[#171717] text-sm text-white/40">Preparing your portal, no files were harmed in the process. ;)</main>'))
  assert.doesNotMatch(portal, /Loading your FICO MANA project/)
})

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
