import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { EMAIL_PLANS, emailUsagePeriod, emailUsagePercent, isEmailPlan } from '../lib/email-usage.ts'

test('email plan limits match the supported Resend Free and Pro allowances', () => {
  assert.deepEqual(EMAIL_PLANS.free, { label: 'Free', monthlyLimit: 3_000, dailyLimit: 100 })
  assert.deepEqual(EMAIL_PLANS.pro, { label: 'Pro', monthlyLimit: 50_000, dailyLimit: null })
  assert.equal(isEmailPlan('free'), true)
  assert.equal(isEmailPlan('pro'), true)
  assert.equal(isEmailPlan('scale'), false)
})

test('usage periods and progress are deterministic at month boundaries', () => {
  assert.deepEqual(emailUsagePeriod(new Date('2026-12-31T23:59:00.000Z')), {
    periodStart: '2026-12-31T16:00:00.000Z',
    periodEnd: '2027-01-31T16:00:00.000Z',
    dayStart: '2026-12-31T16:00:00.000Z',
    dayEnd: '2027-01-01T16:00:00.000Z',
  })
  assert.equal(emailUsagePercent(1_500, 3_000), 50)
  assert.equal(emailUsagePercent(3_500, 3_000), 100)
  assert.equal(emailUsagePercent(-1, 3_000), 0)
})

test('usage endpoint is protected, workspace-scoped, validated, and counts accepted logs', async () => {
  const route = await readFile('app/api/emails/usage/route.ts', 'utf8')
  assert.match(route, /requireStaffAuth\(request\)/)
  assert.match(route, /canUseWorkflow\(access, 'admin'\)/)
  assert.match(route, /workspace_id[^]*current\.access\.workspaceId/)
  assert.match(route, /z\.enum\(\['free', 'pro'\]\)/)
  assert.match(route, /\.eq\('status', 'SENT'\)/)
  assert.match(route, /select\('id', \{ count: 'exact', head: true \}\)/)
  assert.match(route, /privateNoStoreHeaders/)
})

test('email usage storage is service-only and accepted provider ids are deduplicated', async () => {
  const migration = await readFile('supabase/migrations/20260924164924_email_usage_monitoring.sql', 'utf8')
  assert.match(migration, /alter table public\.email_usage_settings enable row level security/i)
  assert.match(migration, /revoke all on table public\.email_usage_settings from public, anon, authenticated/i)
  assert.match(migration, /grant all on table public\.email_usage_settings to service_role/i)
  assert.match(migration, /unique index[^]+email_logs\(provider_id\)/i)
  assert.match(migration, /on conflict \(provider_id\) do nothing/i)
})
