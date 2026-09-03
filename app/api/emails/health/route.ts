import { NextResponse } from 'next/server'
import { requireStaffAuth } from '@/lib/auth-api'
import { getResendDiagnostics, isResendConfigured } from '@/lib/resend-config'
import { sendEmail } from '@/lib/email'

/** Staff-only: verify Resend env + optionally send a test email. */
export async function GET() {
  try {
    const { user, error: authError } = await requireStaffAuth()
    if (authError) return authError

    const diagnostics = getResendDiagnostics()
    return NextResponse.json({
      ok: diagnostics.configured,
      staffEmail: user?.email ?? null,
      ...diagnostics,
    })
  } catch (error) {
    console.error('GET /api/emails/health', error)
    return NextResponse.json({ ok: false, error: 'Health check failed' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { user, error: authError } = await requireStaffAuth()
    if (authError) return authError

    if (!isResendConfigured()) {
      return NextResponse.json(
        {
          success: false,
          error: 'RESEND_API_KEY is not available at runtime. Set it on Vercel and redeploy.',
          diagnostics: getResendDiagnostics(),
        },
        { status: 503 },
      )
    }

    const body = (await request.json().catch(() => ({}))) as { to?: string }
    const to = body.to?.trim() || user?.email
    if (!to) {
      return NextResponse.json({ success: false, error: 'No recipient email' }, { status: 400 })
    }

    const result = await sendEmail({
      bookingId: 'FM-HEALTHCHECK',
      to,
      subject: 'FICO MANA — Resend production test',
      html: `
        <p>This is a test email from your FICO MANA production deployment.</p>
        <p>If you received this, <strong>Resend is working</strong>.</p>
        <p style="font-size:12px;color:#666;">Sent at ${new Date().toISOString()}</p>
      `,
    })

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error, diagnostics: getResendDiagnostics() },
        { status: 502 },
      )
    }

    return NextResponse.json({
      success: true,
      resendId: result.resendId,
      to,
      diagnostics: getResendDiagnostics(),
    })
  } catch (error) {
    console.error('POST /api/emails/health', error)
    return NextResponse.json({ success: false, error: 'Test send failed' }, { status: 500 })
  }
}
