import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireStaffAuth } from '@/lib/auth-api'
import { canUseWorkflow, getWorkflowAccess } from '@/lib/auth/workflow'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { privateNoStoreHeaders } from '@/lib/security/request-security'
import { isR2Configured } from '@/lib/storage/r2-client'

const settingsSchema = z.object({ portalExpiryDays: z.number().int().min(1).max(3650) }).strict()

async function context(request: Request) {
  const { user, error } = await requireStaffAuth(request)
  if (error || !user) return { response: error || NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const access = await getWorkflowAccess(user)
  if (!access || !canUseWorkflow(access, 'admin')) {
    return { response: NextResponse.json({ error: 'Only an administrator can change storage settings.' }, { status: 403, headers: privateNoStoreHeaders() }) }
  }
  const admin = getSupabaseAdmin()
  if (!admin) return { response: NextResponse.json({ error: 'Storage settings are unavailable.' }, { status: 503, headers: privateNoStoreHeaders() }) }
  return { admin, access }
}

export async function GET(request: Request) {
  const current = await context(request)
  if ('response' in current) return current.response
  const { data, error } = await current.admin.from('storage_settings')
    .select('portal_expiry_days,signed_url_ttl_seconds').eq('id', 1).maybeSingle()
  if (error) return NextResponse.json({ error: 'Storage settings could not be loaded.' }, { status: 500, headers: privateNoStoreHeaders() })
  return NextResponse.json({
    provider: 'Cloudflare R2', configured: isR2Configured(), privateBucket: true,
    portalExpiryDays: Number(data?.portal_expiry_days || 30),
    signedUrlTtlSeconds: Number(data?.signed_url_ttl_seconds || 600),
  }, { headers: privateNoStoreHeaders() })
}

export async function PUT(request: Request) {
  const current = await context(request)
  if ('response' in current) return current.response
  const parsed = settingsSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Portal expiry must be between 1 and 3,650 days.' }, { status: 400, headers: privateNoStoreHeaders() })
  const { error } = await current.admin.from('storage_settings').upsert({
    id: 1, workspace_id: current.access.workspaceId, portal_expiry_days: parsed.data.portalExpiryDays,
    signed_url_ttl_seconds: 600, updated_at: new Date().toISOString(),
  }, { onConflict: 'id' })
  if (error) return NextResponse.json({ error: 'Storage settings could not be saved.' }, { status: 500, headers: privateNoStoreHeaders() })
  return NextResponse.json({ success: true, portalExpiryDays: parsed.data.portalExpiryDays }, { headers: privateNoStoreHeaders() })
}
