export const EMAIL_PLANS = {
  free: { label: 'Free', monthlyLimit: 3_000, dailyLimit: 100 },
  pro: { label: 'Pro', monthlyLimit: 50_000, dailyLimit: null },
} as const

export type EmailPlan = keyof typeof EMAIL_PLANS

export function isEmailPlan(value: unknown): value is EmailPlan {
  return value === 'free' || value === 'pro'
}

export function emailUsagePeriod(now = new Date()) {
  const philippinesOffset = 8 * 60 * 60 * 1000
  const studioNow = new Date(now.getTime() + philippinesOffset)
  const periodStart = new Date(Date.UTC(studioNow.getUTCFullYear(), studioNow.getUTCMonth(), 1) - philippinesOffset)
  const periodEnd = new Date(Date.UTC(studioNow.getUTCFullYear(), studioNow.getUTCMonth() + 1, 1) - philippinesOffset)
  const dayStart = new Date(Date.UTC(studioNow.getUTCFullYear(), studioNow.getUTCMonth(), studioNow.getUTCDate()) - philippinesOffset)
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
  return {
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    dayStart: dayStart.toISOString(),
    dayEnd: dayEnd.toISOString(),
  }
}

export function emailUsagePercent(sent: number, limit: number) {
  if (!Number.isFinite(sent) || !Number.isFinite(limit) || limit <= 0) return 0
  return Math.min(100, Math.max(0, (sent / limit) * 100))
}
