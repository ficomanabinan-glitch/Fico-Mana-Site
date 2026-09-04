import { NextResponse } from 'next/server'
import { requireStaffAuth } from '@/lib/auth-api'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error: authError } = await requireStaffAuth()
  if (authError) return authError
  try {
    const { id } = await params
    const admin = getSupabaseAdmin()
    if (!admin) return NextResponse.json({ error: 'Database admin client unavailable.' }, { status: 500 })
    const { data, error } = await admin
      .from('provisioning_audit')
      .select('id,action,actor_type,actor_id,external_resource_id,metadata,error,created_at')
      .eq('booking_id', id)
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) throw new Error(error.message)
    return NextResponse.json(data || [])
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not load audit trail.' }, { status: 500 })
  }
}
