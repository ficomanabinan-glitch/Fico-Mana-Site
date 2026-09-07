import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import ts from 'typescript'

async function uiFiles(directory: string): Promise<string[]> {
  const files: string[] = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await uiFiles(path))
    else if (path.endsWith('.tsx')) files.push(path)
  }
  return files
}

test('UI copy avoids backend provider names and technical setup terminology', async () => {
  const violations: string[] = []
  const jargon = /\b(?:Supabase|Vercel|OAuth|database|backend|frontend)\b|production endpoint|database migration|(?:trusted|secure batch) manifest|Resend (?:accepted|returned|did)|in Resend|configure Resend|Resend email logs/i
  for (const file of [...await uiFiles('app'), ...await uiFiles('components')]) {
    const source = ts.createSourceFile(file, await readFile(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const inspect = (node: ts.Node) => {
      // Comments and identifiers are implementation details, not rendered copy.
      if (ts.isJsxText(node) || ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
        || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
        const value = node.text.trim()
        if (!value.startsWith('@/') && !value.startsWith('@supabase/') && !value.startsWith('@vercel/') && jargon.test(value)) {
          violations.push(`${file}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}: ${value}`)
        }
      }
      ts.forEachChild(node, inspect)
    }
    inspect(source)
  }
  assert.deepEqual(violations, [])
})

test('report and system labels describe business records and keep truthful email status', async () => {
  const reports = await readFile('app/admin/reports/page.tsx', 'utf8')
  const system = await readFile('app/admin/system/page.tsx', 'utf8')
  const email = await readFile('components/email-test-settings.tsx', 'utf8')
  assert.match(reports, /Figures are based on your bookings and payments\./)
  assert.match(system, /title="Records"/)
  assert.match(system, /Only authorized staff can view and update your records\./)
  assert.match(email, /The email service accepted/)
  assert.match(email, /Check the inbox and spam folder to confirm delivery/)
  const reminders = await readFile('app/api/admin/shoot-reminders/route.ts', 'utf8')
  const booking = await readFile('app/api/bookings/[id]/route.ts', 'utf8')
  const googleConnection = await readFile('lib/google-oauth.ts', 'utf8')
  assert.doesNotMatch(reminders, /complete the shoot-reminder database setup/)
  assert.doesNotMatch(booking, /(?:save|delete) booking (?:to|from) database/)
  assert.doesNotMatch(googleConnection, /throw new Error\('(?:OAuth|Google did not return an offline refresh token)/)
})

test('admin pages no longer render the storage subscription Ops Note', async () => {
  for (const file of [...await uiFiles('app'), ...await uiFiles('components')]) {
    const source = await readFile(file, 'utf8')
    assert.doesNotMatch(source, /AdminOpsNotes|admin-ops-notes|Ops Note|Monthly storage subscription \(email\)/, file)
  }
  const skeleton = await readFile('components/admin-page-skeleton.tsx', 'utf8')
  const dashboard = skeleton.split('function DashboardSkeleton()')[1].split('function BookingsSkeleton()')[0]
  assert.doesNotMatch(dashboard, /h-4 w-72 max-w-full/)
  assert.match(dashboard, /h-11 w-full/)
  assert.match(dashboard, /length: 6/)
})
