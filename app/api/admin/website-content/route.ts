import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireWorkflowAuth } from '@/lib/auth-api'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { mapWebsiteContent } from '@/lib/website-content'
import { secureErrorResponse } from '@/lib/security/error-response'

const httpsUrl = z.string().trim().url().max(500).refine((value) => new URL(value).protocol === 'https:', 'Use a secure HTTPS address.')
const optionalHttpsUrl = z.union([z.literal(''), httpsUrl])
const contentSchema = z.object({
  studioName: z.string().trim().min(1).max(80),
  phoneNumber: z.string().trim().min(7).max(40),
  publicEmail: z.union([z.literal(''), z.string().trim().email().max(160)]),
  addressLine1: z.string().trim().min(1).max(160),
  addressLine2: z.string().trim().max(160),
  mapEmbedUrl: httpsUrl.refine((value) => /(^|\.)google\.(com|com\.ph)$|(^|\.)googleapis\.com$|(^|\.)maps\.google\.com$/.test(new URL(value).hostname), 'Use a Google Maps embed link.'),
  mapDirectionsUrl: httpsUrl,
  facebookUrl: optionalHttpsUrl,
  instagramUrl: optionalHttpsUrl,
  tiktokUrl: optionalHttpsUrl,
  businessHours: z.string().trim().max(200),
}).strict()

const columns = 'workspace_id,studio_name,phone_number,public_email,address_line_1,address_line_2,map_embed_url,map_directions_url,facebook_url,instagram_url,tiktok_url,business_hours'

export async function GET(request: Request) {
  const auth = await requireWorkflowAuth('admin', request)
  if (auth.error || !auth.access) return auth.error
  const admin = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: 'Content management is unavailable.' }, { status: 500 })
  try {
    const { data, error } = await admin.from('website_content_settings').select(columns).eq('workspace_id', auth.access.workspaceId).maybeSingle()
    if (error) throw error
    return NextResponse.json(mapWebsiteContent(data as Record<string, unknown> | null), { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return secureErrorResponse(error, 'Failed to load website content.', { context: 'GET /api/admin/website-content' })
  }
}

export async function PATCH(request: Request) {
  const auth = await requireWorkflowAuth('admin', request)
  if (auth.error || !auth.access || !auth.user) return auth.error
  const admin = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: 'Content management is unavailable.' }, { status: 500 })
  const parsed = contentSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Check the website details.' }, { status: 400 })
  const value = parsed.data
  try {
    const { data, error } = await admin.from('website_content_settings').upsert({
      workspace_id: auth.access.workspaceId,
      studio_name: value.studioName,
      phone_number: value.phoneNumber,
      public_email: value.publicEmail,
      address_line_1: value.addressLine1,
      address_line_2: value.addressLine2,
      map_embed_url: value.mapEmbedUrl,
      map_directions_url: value.mapDirectionsUrl,
      facebook_url: value.facebookUrl,
      instagram_url: value.instagramUrl,
      tiktok_url: value.tiktokUrl,
      business_hours: value.businessHours,
      updated_by: auth.user.id,
    }, { onConflict: 'workspace_id' }).select(columns).single()
    if (error) throw error
    return NextResponse.json(mapWebsiteContent(data as Record<string, unknown>))
  } catch (error) {
    return secureErrorResponse(error, 'Failed to save website content.', { request, context: 'PATCH /api/admin/website-content' })
  }
}
