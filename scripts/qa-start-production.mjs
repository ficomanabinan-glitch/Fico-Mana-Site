import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// Browser interception does not cover SSR reads. Preload a local HTTP fixture
// without disabling production startup validation or using hosted credentials.
const browserFixtures = process.argv.includes('--browser-fixtures')
const isolated = {
  QA_ISOLATED_LOCAL: 'true',
  // Keep identical to the isolated build and its sb-127 synthetic session cookie.
  NEXT_PUBLIC_SUPABASE_URL: 'https://127.0.0.1:54321',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'qa-publishable',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'qa-publishable',
  SUPABASE_SECRET_KEY: `qa-service-${'1'.repeat(32)}`,
  SUPABASE_SERVICE_ROLE_KEY: '',
  PORTAL_SIGNING_SECRET: `qa-portal-${'2'.repeat(32)}`,
  SECURITY_HASH_SECRET: `qa-hash-${'3'.repeat(32)}`,
  CLOUDFLARE_ACCOUNT_ID: 'qa-account',
  R2_ACCESS_KEY_ID: 'qa-access',
  R2_SECRET_ACCESS_KEY: `qa-r2-${'4'.repeat(32)}`,
  R2_BUCKET_NAME: 'qa-bucket',
  R2_ENDPOINT: 'https://r2.invalid',
  RESEND_API_KEY: 'qa-resend',
  NEXT_PUBLIC_STAGING_ADMIN_PASSWORD: '',
}

const preload = browserFixtures ? ['--import', pathToFileURL(resolve('scripts/qa-ssr-fixtures.mjs')).href] : []
const child = spawn(process.execPath, [...preload, resolve('node_modules/next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', process.env.QA_PORT || '3200'], {
  cwd: process.cwd(),
  env: { ...process.env, ...isolated },
  stdio: 'inherit',
})
child.on('exit', (code, signal) => process.exit(signal ? 1 : code ?? 0))
