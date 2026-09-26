import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { getFicoManaWorkspaceId } from '@/lib/website-media-server'
import { DEFAULT_WEBSITE_CONTENT, mapWebsiteContent } from '@/lib/website-content'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const admin = getSupabaseAdmin()
    if (!admin) return NextResponse.json(DEFAULT_WEBSITE_CONTENT)
    const workspaceId = await getFicoManaWorkspaceId()
    const { data, error } = await admin.from('website_content_settings').select('*').eq('workspace_id', workspaceId).maybeSingle()
    if (error) throw error
    return NextResponse.json(mapWebsiteContent(data as Record<string, unknown> | null), {
      headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' },
    })
  } catch {
    return NextResponse.json(DEFAULT_WEBSITE_CONTENT)
  }
}
