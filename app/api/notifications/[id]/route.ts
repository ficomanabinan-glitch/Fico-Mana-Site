import { NextResponse } from 'next/server'
import { markServerNotificationRead } from '@/lib/server-store'
import { requireStaffAuth } from '@/lib/auth-api'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { isSupabaseConfigured } from '@/lib/supabase/env'

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { error: authError } = await requireStaffAuth()
    if (authError) return authError

    const { id } = await params

    if (isSupabaseConfigured()) {
      const admin = getSupabaseAdmin()
      if (admin) {
        const { error } = await admin.from('notifications').update({ is_read: true }).eq('id', id)
        if (!error) {
          await markServerNotificationRead(id)
          return NextResponse.json({ ok: true })
        }
      }
    }

    await markServerNotificationRead(id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update notification' }, { status: 500 })
  }
}
