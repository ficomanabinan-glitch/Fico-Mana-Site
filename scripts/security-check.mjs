import { readFile } from 'node:fs/promises'

const failures = []
const read = (path) => readFile(path, 'utf8')

const packageJson = JSON.parse(await read('package.json'))
const nextVersion = String(packageJson.dependencies?.next || '')
const nextMatch = nextVersion.match(/^(\d+)\.(\d+)\.(\d+)$/)
const nextIsPatched = nextMatch && (
  Number(nextMatch[1]) > 16 ||
  (Number(nextMatch[1]) === 16 && (
    Number(nextMatch[2]) > 2 ||
    (Number(nextMatch[2]) === 2 && Number(nextMatch[3]) >= 11)
  ))
)
if (!nextIsPatched) failures.push(`Next.js must be 16.2.11 or newer; found ${nextVersion || 'none'}.`)

const uploadRoute = await read('app/api/receipts/upload/route.ts')
if (uploadRoute.includes('getPublicUrl')) failures.push('Receipt upload still creates a public URL.')
if (!uploadRoute.includes('validateReceiptImageContent')) failures.push('Receipt content validation is missing.')

const portalRoute = await read('app/api/editor-workflow/[...path]/route.ts')
if (!portalRoute.includes('PORTAL_SESSION_COOKIE')) failures.push('Portal session cookie is missing.')
if (!portalRoute.includes('enforceApiRateLimit')) failures.push('Editor/portal rate limiting is missing.')

const proxy = await read('proxy.ts')
if (proxy.includes('Access-Control-Allow-Origin')) failures.push('Global reflected CORS header is still present.')
if (!proxy.includes("pathname.startsWith('/api/')")) failures.push('API no-store policy is missing.')

const migration = await read('supabase/migrations/20260906151436_production_security_hardening.sql')
for (const marker of [
  'consume_api_rate_limit',
  'security_audit_events',
  'drop policy if exists "Public read receipts"',
  'storage_path',
]) {
  if (!migration.includes(marker)) failures.push(`Security migration is missing ${marker}.`)
}

for (const [name, value] of Object.entries(process.env)) {
  if (name.startsWith('NEXT_PUBLIC_') && /(SECRET|SERVICE_ROLE|PRIVATE|TOKEN_ENCRYPTION)/.test(name) && value) {
    failures.push(`Server credential is exposed through ${name}.`)
  }
}

if (failures.length) {
  console.error('Security checks failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exitCode = 1
} else {
  console.log('Security source checks passed.')
}
