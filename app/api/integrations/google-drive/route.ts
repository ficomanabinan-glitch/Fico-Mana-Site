import { NextResponse } from 'next/server'
import { requireStaffAuth } from '@/lib/auth-api'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { getDriveFolder, resolveDriveRootFolder } from '@/lib/google-drive'

type Body = {
  rootFolderId?: string
  portalExpiryDays?: number
  initializeRoot?: boolean
}

export async function GET() {
  const { error: authError } = await requireStaffAuth()
  if (authError) return authError

  const admin = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: 'Database admin client unavailable.' }, { status: 500 })
  const { data } = await admin
    .from('google_drive_settings')
    .select('root_folder_id,root_folder_name,portal_expiry_days,updated_at')
    .eq('id', 1)
    .maybeSingle()

  return NextResponse.json({
    rootFolderId: data?.root_folder_id || null,
    rootFolderName: data?.root_folder_name || 'FICOMANA SHOOTS',
    portalExpiryDays: Number(data?.portal_expiry_days || 30),
    updatedAt: data?.updated_at || null,
    oauthConfigured: Boolean(
      process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim() &&
      process.env.GOOGLE_REFRESH_TOKEN?.trim(),
    ),
  })
}

export async function PUT(request: Request) {
  const { error: authError } = await requireStaffAuth()
  if (authError) return authError

  try {
    const body = (await request.json()) as Body
    const admin = getSupabaseAdmin()
    if (!admin) return NextResponse.json({ error: 'Database admin client unavailable.' }, { status: 500 })

    let rootFolderId = body.rootFolderId?.trim() || null
    let rootFolderName = 'FICOMANA SHOOTS'

    if (rootFolderId) {
      const folder = await getDriveFolder(rootFolderId)
      rootFolderId = folder.id
      rootFolderName = folder.name
    } else if (body.initializeRoot) {
      const folder = await resolveDriveRootFolder(admin)
      rootFolderId = folder.id
      rootFolderName = folder.name
    }

    const portalExpiryDays = body.portalExpiryDays === undefined
      ? undefined
      : Math.max(1, Math.min(3650, Math.round(Number(body.portalExpiryDays))))

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      ...(rootFolderId ? { root_folder_id: rootFolderId, root_folder_name: rootFolderName } : {}),
      ...(portalExpiryDays ? { portal_expiry_days: portalExpiryDays } : {}),
    }
    const { data, error } = await admin
      .from('google_drive_settings')
      .update(patch)
      .eq('id', 1)
      .select('root_folder_id,root_folder_name,portal_expiry_days,updated_at')
      .single()
    if (error) throw new Error(error.message)

    return NextResponse.json(data)
  } catch (error) {
    console.error('PUT /api/integrations/google-drive', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not update Google Drive settings.' },
      { status: 500 },
    )
  }
}
