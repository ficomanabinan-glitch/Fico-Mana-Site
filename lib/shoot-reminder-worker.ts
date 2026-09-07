import type { SupabaseClient } from '@supabase/supabase-js'
import { buildShootReminder, type ShootReminderKind, type ShootReminderPayload } from './shoot-reminder-content'
import { getResendClient, getResendFromAddress } from './resend-config'
import { getSiteUrl } from './site-url'

type Delivery = { id: string; claim_token: string; kind: ShootReminderKind; payload: ShootReminderPayload }

export async function runShootReminderWorker(admin: SupabaseClient) {
  const resend = getResendClient()
  if (!resend) throw new Error('Reminder email service is not configured.')
  const { data, error } = await admin.rpc('claim_shoot_reminders', { p_limit: 40 })
  if (error) throw new Error('Could not load scheduled reminders. Try: check the reminder settings.')
  const jobs = (data || []) as Delivery[]
  const result = { claimed: jobs.length, sent: 0, failed: 0, skipped: 0, deferred: 0 }
  const deadline = Date.now() + 85_000
  for (const job of jobs) {
    // Unprocessed leases expire; the next scheduled run reclaims them safely.
    if (Date.now() >= deadline) { result.deferred++; continue }
    const finish = async (status: 'sent' | 'failed' | 'skipped', details: Record<string, unknown> = {}) => {
      const { error: finishError } = await admin.rpc('finish_shoot_reminder', {
        p_id: job.id, p_claim: job.claim_token, p_status: status, ...details,
      })
      if (finishError) throw new Error('Reminder receipt could not be saved; retry will use the same email idempotency key.')
      result[status]++
    }
    const { data: current, error: checkError } = await admin.rpc('shoot_reminder_is_current', {
      p_id: job.id, p_claim: job.claim_token,
    })
    if (checkError) { await finish('failed', { p_error: 'Could not recheck attendance before sending.' }); continue }
    if (!current) { await finish('skipped', { p_error: 'Booking changed or client declined before dispatch.' }); continue }
    const content = buildShootReminder(job.payload, job.kind, getSiteUrl())
    try {
      const response = await resend.emails.send({
        from: getResendFromAddress(), to: [job.payload.customerEmail], ...content,
        tags: [{ name: 'category', value: `shoot_${job.kind}` }],
      }, { idempotencyKey: `shoot-reminder/${job.id}` })
      if (response.error || !response.data?.id) {
        await finish('failed', { p_error: response.error?.name || 'Email provider did not accept the reminder.' })
      } else {
        await finish('sent', { p_provider_id: response.data.id, p_subject: content.subject, p_html: content.html })
      }
    } catch {
      // A lost acknowledgement is safely retried with the same immutable payload and key.
      await finish('failed', { p_error: 'Email request or receipt failed. Automatic retry is scheduled.' })
    }
    // Stay below the provider's default two-requests-per-second rate.
    await new Promise(resolve => setTimeout(resolve, 650))
  }
  const { error: recordError } = await admin.from('shoot_reminder_settings')
    .update({ last_completed_at: new Date().toISOString(), last_result: result }).eq('id', 1)
  if (recordError) throw new Error('Reminder run status could not be saved.')
  return result
}
