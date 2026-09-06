import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { safeMetadata } from '@/lib/security/audit-metadata'

export type SecurityAuditEvent = {
  eventType: string
  outcome: 'success' | 'failure' | 'blocked'
  actorId?: string | null
  workspaceId?: string | null
  bookingId?: string | null
  route?: string | null
  metadata?: Record<string, unknown>
}

/** Security audit logging is best-effort and never records credentials or bearer tokens. */
export async function recordSecurityAuditEvent(event: SecurityAuditEvent) {
  try {
    const admin = getSupabaseAdmin()
    if (!admin) return
    const { error } = await admin.from('security_audit_events').insert({
      event_type: event.eventType.slice(0, 100),
      outcome: event.outcome,
      actor_id: event.actorId?.slice(0, 200) || null,
      workspace_id: event.workspaceId || null,
      booking_id: event.bookingId?.slice(0, 100) || null,
      route: event.route?.slice(0, 300) || null,
      metadata: safeMetadata(event.metadata),
    })
    if (error) console.error('Security audit insert failed:', error.code)
  } catch {
    console.error('Security audit unavailable')
  }
}
