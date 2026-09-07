import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  SHOOT_REMINDER_NOTIFICATION_TYPE, reminderDeliveryIssue, reminderIssue, reminderLocalDate,
  reminderRunIssue, reminderScheduleIsLate, type ShootReminderIssueCode,
} from './shoot-reminder-issues'

export class ShootReminderRunError extends Error {
  constructor(readonly code: ShootReminderIssueCode) { super(reminderIssue(code).message) }
}

export function reminderNotification(code: ShootReminderIssueCode, now = new Date()) {
  const key = `fico-mana/shoot-reminder/${reminderLocalDate(now)}/${code}`
  const hash = createHash('sha256').update(key).digest('hex')
  // Deterministic UUID works with the existing notification primary key. Concurrent retries
  // insert at most one alert per issue per GMT+8 day, without resetting an admin's read status.
  const id = `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-8${hash.slice(17,20)}-${hash.slice(20,32)}`
  // Production permits NULL for a system notification but requires every non-null
  // booking reference to exist. Never invent a booking or weaken that foreign key.
  return { id, booking_id: null, type: SHOOT_REMINDER_NOTIFICATION_TYPE, is_read: false,
    message: `Shoot reminders reported a problem. ${reminderIssue(code).message} The saved enabled/disabled setting has not changed.`,
    created_at: now.toISOString() }
}

export async function notifyShootReminderIssue(admin: SupabaseClient, code: ShootReminderIssueCode, now = new Date()) {
  try {
    const { error } = await admin.from('notifications').upsert(reminderNotification(code, now), {
      onConflict: 'id', ignoreDuplicates: true,
    })
    if (error) throw new Error('Notification could not be stored')
    return true
  } catch {
    // Alert persistence must never change a delivery result or trigger a second send.
    console.error('Shoot reminder alert could not be saved. Check the reminder service and notification storage.')
    return false
  }
}

export async function recordShootReminderRunFailure(admin: SupabaseClient, failure: unknown) {
  const code = failure instanceof ShootReminderRunError ? failure.code : 'run'
  await notifyShootReminderIssue(admin, code)
  try {
    const { error } = await admin.from('shoot_reminder_settings').update({
      last_result: { errorCode: code, failedAt: new Date().toISOString() },
    }).eq('id', 1)
    if (error) throw new Error('Status could not be stored')
  } catch {
    console.error('Shoot reminder failure status could not be saved. Check the reminder connection.')
  }
}

/** Existing tables only; no queue claims, email sends, or enable/disable changes. */
export async function getShootReminderHealth(admin: SupabaseClient, workspaceId: string, now = new Date()) {
  const [settingsResult, failedResult] = await Promise.all([
    admin.from('shoot_reminder_settings').select('enabled,updated_at,last_completed_at,last_result').eq('id', 1).single(),
    admin.from('shoot_reminder_deliveries')
      .select('last_error,shoot_invitations!inner(workspace_id)', { count: 'exact' })
      .eq('shoot_invitations.workspace_id', workspaceId).eq('due_date', reminderLocalDate(now))
      .eq('status', 'failed').order('first_attempt_at', { ascending: false }).limit(1),
  ])
  if (settingsResult.error || failedResult.error || !settingsResult.data) {
    return { issue: reminderIssue('run'), failedToday: null, available: false }
  }
  const failedToday = failedResult.count ?? 0
  const issue = reminderRunIssue(settingsResult.data.last_result)
    ?? (failedToday > 0 ? reminderIssue(reminderDeliveryIssue(failedResult.data?.[0]?.last_error)) : null)
    ?? (reminderScheduleIsLate(settingsResult.data, now) ? reminderIssue('stalled') : null)
  return { issue, failedToday, available: true }
}
