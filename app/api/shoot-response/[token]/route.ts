import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { enforceApiRateLimit } from '@/lib/security/api-rate-limit'
import { privateNoStoreHeaders, rejectUntrustedMutation } from '@/lib/security/request-security'

type Context = { params: Promise<{ token: string }> }
const tokenPattern = /^[a-f0-9]{64}$/

async function handle(request: Request, context: Context, mutate: boolean) {
  const headers = { ...privateNoStoreHeaders(), 'Referrer-Policy': 'no-referrer' }
  if (mutate) { const originError = rejectUntrustedMutation(request); if (originError) return originError }
  const { token } = await context.params
  if (!tokenPattern.test(token)) return NextResponse.json({ error: 'This reminder link is invalid.' }, { status: 404, headers })
  const limited = await enforceApiRateLimit(request, {
    name: mutate ? 'shoot-response-write' : 'shoot-response-read', limit: mutate ? 12 : 40,
    windowSeconds: 600, failClosed: true,
  }, [token])
  if (limited) return limited
  const admin = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: 'Responses are temporarily unavailable. Try: contact FICO MANA Studio.' }, { status: 503, headers })
  let response: string | undefined
  let note = ''
  if (mutate) {
    const body = await request.json().catch(() => null)
    if (!body || !['confirmed','declined'].includes(body.response) ||
      (body.note !== undefined && (typeof body.note !== 'string' || body.note.length > 500))) {
      return NextResponse.json({ error: 'Choose Confirm My Shoot or I Can’t Attend. Notes must be 500 characters or fewer.' }, { status: 400, headers })
    }
    response = body.response
    note = (body.note || '').trim()
  }
  const { data, error } = mutate
    ? await admin.rpc('respond_to_shoot', { p_token: token, p_response: response, p_note: note })
    : await admin.rpc('get_shoot_invitation', { p_token: token })
  if (error) return NextResponse.json({ error: 'Your response could not be loaded or saved. Try: refresh this page or contact FICO MANA Studio.' }, { status: 503, headers })
  if (!data) return NextResponse.json({ error: 'This reminder link has expired or the booking schedule changed. Try: use the latest reminder email or contact FICO MANA Studio.' }, { status: 410, headers })
  return NextResponse.json(data, { headers })
}

export function GET(request: Request, context: Context) { return handle(request, context, false) }
export function POST(request: Request, context: Context) { return handle(request, context, true) }
