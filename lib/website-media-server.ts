import { getSupabaseAdmin } from '@/lib/supabase/admin'
import {
  DEFAULT_WEBSITE_MEDIA,
  WEBSITE_MEDIA_BUCKET,
  isWebsiteMediaSlotKey,
  mergeWebsiteMedia,
  type WebsiteMediaSlot,
} from '@/lib/website-media'

type WebsiteMediaRow = {
  slot_key: string
  storage_path: string
  file_name: string
  mime_type: string
  file_size: number | null
  alt_text: string
  updated_at: string
}

export async function getFicoManaWorkspaceId() {
  const admin = getSupabaseAdmin()
  if (!admin) throw new Error('This service is temporarily unavailable. Try: refresh the page, or contact your administrator.')
  const { data, error } = await admin
    .from('workspaces')
    .select('id')
    .eq('slug', 'fico-mana')
    .eq('status', 'active')
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data?.id) throw new Error('Studio workspace is not configured.')
  return String(data.id)
}

export async function getWebsiteMediaForWorkspace(workspaceId: string): Promise<WebsiteMediaSlot[]> {
  const admin = getSupabaseAdmin()
  if (!admin) throw new Error('This service is temporarily unavailable. Try: refresh the page, or contact your administrator.')
  const { data, error } = await admin
    .from('website_media_slots')
    .select('slot_key,storage_path,file_name,mime_type,file_size,alt_text,updated_at')
    .eq('workspace_id', workspaceId)
  if (error) throw new Error(error.message)

  const rows = ((data ?? []) as WebsiteMediaRow[]).flatMap((row) => {
    if (!isWebsiteMediaSlotKey(row.slot_key) || !row.storage_path) return []
    const publicUrl = admin.storage.from(WEBSITE_MEDIA_BUCKET).getPublicUrl(row.storage_path).data.publicUrl
    const version = row.updated_at ? `?v=${encodeURIComponent(row.updated_at)}` : ''
    return [{
      slotKey: row.slot_key,
      url: `${publicUrl}${version}`,
      altText: row.alt_text,
      fileName: row.file_name,
      mimeType: row.mime_type,
      fileSize: row.file_size,
      updatedAt: row.updated_at,
      isCustom: true,
    }]
  })

  return mergeWebsiteMedia(rows)
}

export async function getPublishedWebsiteMedia(): Promise<WebsiteMediaSlot[]> {
  try {
    return await getWebsiteMediaForWorkspace(await getFicoManaWorkspaceId())
  } catch (error) {
    console.error('Website media fallback used:', error)
    return DEFAULT_WEBSITE_MEDIA.map((slot) => ({ ...slot }))
  }
}
