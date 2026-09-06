import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireStaffAuth } from '@/lib/auth-api'
import { API_RATE_LIMITS, enforceApiRateLimit } from '@/lib/security/api-rate-limit'
import { privateNoStoreHeaders } from '@/lib/security/request-security'
import { recordSecurityAuditEvent } from '@/lib/security/security-audit'

const bodySchema = z
  .object({
    eventType: z.enum(['mfa_enrollment_started', 'mfa_verified', 'mfa_challenge_failed']),
  })
  .strict()

export async function POST(request: Request) {
  const auth = await requireStaffAuth(request, { requireMfa: false })
  if (auth.error || !auth.user) return auth.error
  const limited = await enforceApiRateLimit(request, API_RATE_LIMITS.mfaEvent, [auth.user.id])
  if (limited) return limited

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid security event.' }, { status: 400, headers: privateNoStoreHeaders() })
  }
  if (parsed.data.eventType === 'mfa_verified' && auth.assurance?.currentLevel !== 'aal2') {
    return NextResponse.json({ error: 'MFA verification is not active.' }, { status: 409, headers: privateNoStoreHeaders() })
  }

  await recordSecurityAuditEvent({
    eventType: parsed.data.eventType,
    outcome: parsed.data.eventType === 'mfa_challenge_failed' ? 'failure' : 'success',
    actorId: auth.user.id,
    route: '/admin/mfa',
  })
  return NextResponse.json({ ok: true }, { headers: privateNoStoreHeaders() })
}
