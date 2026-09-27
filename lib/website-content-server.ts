import 'server-only'
import { cache } from 'react'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { getFicoManaWorkspaceId } from '@/lib/website-media-server'
import { DEFAULT_WEBSITE_CONTENT, mapWebsiteContent } from '@/lib/website-content'

// Deduplicate metadata and page reads within a request, without retaining stale policies.
export const getPublishedWebsiteContent = cache(async () => {
  const admin = getSupabaseAdmin()
  if (!admin) return DEFAULT_WEBSITE_CONTENT
  const workspaceId = await getFicoManaWorkspaceId()
  const { data, error } = await admin.from('website_content_settings').select('*').eq('workspace_id', workspaceId).maybeSingle()
  if (error) throw new Error('Website content is temporarily unavailable.')
  return mapWebsiteContent(data as Record<string, unknown> | null)
})
