import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const hasModernSecret = !!process.env.SUPABASE_SECRET_KEY
  const hasLegacyServiceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY
  const adminAvailable = !!getSupabaseAdmin()

  return NextResponse.json({
    hasModernSecret,
    hasLegacyServiceRole,
    adminAvailable,
  })
}
