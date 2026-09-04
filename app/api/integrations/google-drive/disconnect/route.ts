import { NextResponse } from 'next/server'
import { requireStaffAuth } from '@/lib/auth-api'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export async function POST() {
  const { user, error: authError } = await requireStaffAuth()
  if (authError) return authError

  try {
    const admin = getSupabaseAdmin()
    if (!admin) return NextResponse.json({ error: 'Database admin client unavailable.' }, { status: 500 })
    const now = new Date().toISOString()
    const { error } = await admin
      .from('google_drive_settings')
      .update({
        account_email: null,
        refresh_token_encrypted: null,
        granted_scopes: null,
        disconnected_at: now,
        updated_at: now,
      })
      .eq('id', 1)
    if (error) throw new Error(error.message)

    await admin.from('provisioning_audit').insert({
      booking_id: null,
      action: 'google_drive_disconnected',
      actor_type: 'staff',
      actor_id: user?.id || null,
      metadata: {},
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not disconnect Google Drive.' },
      { status: 500 },
    )
  }
}
