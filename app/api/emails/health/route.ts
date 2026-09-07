import { NextResponse } from 'next/server'
import { requireStaffAuth } from '@/lib/auth-api'
import { getResendClient, getResendDiagnostics, getResendFromAddress } from '@/lib/resend-config'
import { buildEmailHealthCheck, emailHealthRequest, sendEmailHealthCheck } from '@/lib/email-health'
import { enforceApiRateLimit } from '@/lib/security/api-rate-limit'
import { privateNoStoreHeaders } from '@/lib/security/request-security'

/** Configuration alone is not evidence of acceptance or inbox delivery. */
export async function GET() {
  const headers = privateNoStoreHeaders()
  try {
    const { user, error: authError } = await requireStaffAuth()
    if (authError) return authError

    const diagnostics = getResendDiagnostics()
    return NextResponse.json({
      ok: diagnostics.configured,
      staffEmail: user?.email ?? null,
      ...diagnostics,
    }, { headers })
  } catch {
    return NextResponse.json({ ok: false, error: 'Health check failed. Try: refresh the page and check your admin session.' }, { status: 500, headers })
  }
}

export async function POST(request: Request) {
  const headers = privateNoStoreHeaders()
  try {
    const { user, error: authError } = await requireStaffAuth(request)
    if (authError) return authError

    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401, headers })

    const raw = await request.text()
    if (raw.length > 1024) return NextResponse.json({ success: false, error: 'Request is too large.' }, { status: 413, headers })
    let body: unknown
    try { body = JSON.parse(raw) } catch { body = null }
    const input = emailHealthRequest.safeParse(body)
    if (!input.success) return NextResponse.json({ success: false, error: 'Invalid test request. Try: enter one valid email address and refresh the page.' }, { status: 400, headers })

    const limited = await enforceApiRateLimit(request, {
      name: 'email-health-test', limit: 5, windowSeconds: 3600, failClosed: true,
    }, [user.id])
    if (limited) return limited

    const resend = getResendClient()
    if (!resend) return NextResponse.json({ success: false, error: 'Email service is not configured. Try: set RESEND_API_KEY in Vercel and redeploy.' }, { status: 503, headers })

    const message = buildEmailHealthCheck(getResendFromAddress(), user.id, input.data)
    const result = await sendEmailHealthCheck(message, (payload, options) => resend.emails.send(payload, options))
    return NextResponse.json(result, { headers })
  } catch (error) {
    // Never expose SDK/transport details or report an accepted message as a booking-log failure.
    const message = error instanceof Error && error.message.startsWith('Resend did not confirm acceptance.')
      ? error.message
      : 'Email result could not be confirmed. Try: check Resend email logs, then retry this same request.'
    return NextResponse.json({ success: false, error: message }, { status: 502, headers })
  }
}
