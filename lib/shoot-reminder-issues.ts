/** Public, fixed messages only. Never display provider payloads, credentials or RSVP links. */
export const shootReminderIssues = {
  email_setup: 'The reminder email connection needs attention. Try: check the email settings in System Settings, then send a test email.',
  sender: 'The email service rejected a reminder. Try: verify the sender address and sending permissions, and check the client email in Shoot Reminders.',
  allowance: 'The reminder email sending limit was reached. Try: check the email allowance or wait for it to reset. Eligible reminders retry between 6 and 8 AM (GMT+8).',
  delivery: 'An automatic shoot reminder could not be sent. Try: check the client email and email service, then review Shoot Reminders. Eligible reminders retry between 6 and 8 AM (GMT+8).',
  attendance: 'Attendance could not be checked before sending a reminder. Try: Check Reminder Service in System Settings, then refresh Shoot Reminders. The email was not sent without this check.',
  queue: 'The scheduled reminder list could not be loaded. Try: Check Reminder Service in System Settings; if it still fails, ask your administrator to check the reminder connection.',
  receipt: 'A reminder delivery result could not be saved. Try: check Email Logs and Check Reminder Service. Do not recreate the reminder; automatic retries reuse the same email reference to avoid duplicates.',
  run: 'The automatic reminder run could not finish. Try: Check Reminder Service in System Settings and review Shoot Reminders. Eligible pending emails retry between 6 and 8 AM (GMT+8).',
  schedule: 'The reminder schedule needs attention. Try: Check Reminder Service in System Settings to repair the schedule. Reminders have not been switched off.',
  stalled: 'No recent automatic reminder check was confirmed. Try: Check Reminder Service in System Settings, then refresh the status. If it continues, ask your administrator to check the scheduled service.',
} as const

export type ShootReminderIssueCode = keyof typeof shootReminderIssues
export type ShootReminderIssue = { code: ShootReminderIssueCode; message: string }
export const SHOOT_REMINDER_NOTIFICATION_TYPE = 'SHOOT_REMINDER_ERROR'

export function reminderIssue(code: ShootReminderIssueCode): ShootReminderIssue {
  return { code, message: shootReminderIssues[code] }
}

export function reminderDeliveryIssue(reason: unknown): ShootReminderIssueCode {
  const value = typeof reason === 'string' ? reason.toLowerCase() : ''
  if (['missing_api_key', 'invalid_api_key', 'email_setup'].includes(value)) return 'email_setup'
  if (['validation_error', 'restricted_api_key', 'invalid_from_address', 'sender'].includes(value)) return 'sender'
  if (['rate_limit_exceeded', 'daily_quota_exceeded', 'monthly_quota_exceeded', 'allowance'].includes(value)) return 'allowance'
  if (value === 'attendance' || value === 'could not recheck attendance before sending.') return 'attendance'
  if (value === 'receipt') return 'receipt'
  return 'delivery'
}

export function reminderRunIssue(result: unknown): ShootReminderIssue | null {
  if (!result || typeof result !== 'object') return null
  const code = (result as { errorCode?: unknown }).errorCode
  return typeof code === 'string' && Object.hasOwn(shootReminderIssues, code)
    ? reminderIssue(code as ShootReminderIssueCode) : null
}

export function reminderLocalDate(now = new Date()) {
  return new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/** A grace period avoids warning during a running request or immediately after enabling. */
export function reminderScheduleIsLate(settings: {
  enabled: boolean; updated_at?: string | null; last_completed_at?: string | null
}, now = new Date()) {
  if (!settings.enabled || !settings.updated_at) return false
  const day = reminderLocalDate(now)
  const windowStart = Date.parse(`${day}T06:00:00+08:00`)
  const windowEnd = Date.parse(`${day}T08:00:00+08:00`)
  const changedAt = Date.parse(settings.updated_at)
  if (!Number.isFinite(changedAt) || changedAt >= windowEnd) return false
  const expectedAfter = Math.max(windowStart, changedAt)
  const compareAt = Math.min(now.getTime(), windowEnd)
  if (compareAt - expectedAfter < 15 * 60_000) return false
  const completedAt = Date.parse(settings.last_completed_at || '')
  return !Number.isFinite(completedAt) || completedAt < compareAt - 15 * 60_000
}
