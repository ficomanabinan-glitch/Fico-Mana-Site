import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireWorkflowAuth } from '@/lib/auth-api'
import { changeOwnPasswordSchema } from '@/lib/auth/staff-user-management'
import { secureErrorResponse } from '@/lib/security/error-response'
import { privateNoStoreHeaders } from '@/lib/security/request-security'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { getSupabaseKey, getSupabaseUrl } from '@/lib/supabase/env'

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: privateNoStoreHeaders() })

export async function POST(request: Request) {
  const { user, access, error } = await requireWorkflowAuth('view', request)
  if (error) return error
  const admin = getSupabaseAdmin()
  if (!admin || !user || !access || !user.email) return json({ error: 'Password change is temporarily unavailable.' }, 503)

  try {
    const parsed = changeOwnPasswordSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return json({ error: parsed.error.issues[0]?.message || 'Check the password fields.' }, 400)

    const verifier = createClient(getSupabaseUrl(), getSupabaseKey(), {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
    const verification = await verifier.auth.signInWithPassword({
      email: user.email,
      password: parsed.data.currentPassword,
    })
    if (verification.error || verification.data.user?.id !== user.id) {
      return json({ error: 'Your current password is incorrect.' }, 401)
    }

    const updated = await admin.auth.admin.updateUserById(user.id, { password: parsed.data.newPassword })
    if (updated.error) throw updated.error

    await admin.from('workflow_audit_logs').insert({
      workspace_id: access.workspaceId,
      actor_type: 'staff',
      actor_id: user.id,
      action: 'STAFF_PASSWORD_CHANGED',
      metadata: {},
    })
    return json({ ok: true })
  } catch (caught) {
    return secureErrorResponse(caught, 'Could not change your password.', { request, context: 'POST /api/admin/users/password' })
  }
}
