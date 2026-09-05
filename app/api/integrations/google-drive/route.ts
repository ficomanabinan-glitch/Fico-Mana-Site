import { NextResponse } from 'next/server'
import { requireStaffAuth } from '@/lib/auth-api'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { getDriveFolder, initializeDriveRootFolder } from '@/lib/google-drive'
import { googleOAuthAppConfigured } from '@/lib/google-oauth'
import { hasRequiredGoogleDriveScopes } from '@/lib/google-drive-scopes'

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
    .select('root_folder_id,root_folder_name,portal_expiry_days,account_email,refresh_token_encrypted,granted_scopes,connected_at,disconnected_at,updated_at')
    .eq('id', 1)
    .maybeSingle()

  return NextResponse.json({
    rootFolderId: data?.root_folder_id || null,
    rootFolderName: data?.root_folder_name || 'FICOMANA SHOOTS',
    portalExpiryDays: Number(data?.portal_expiry_days || 30),
    updatedAt: data?.updated_at || null,
    oauthAppConfigured: googleOAuthAppConfigured(),
    connected: Boolean(data?.refresh_token_encrypted),
    accountEmail: data?.account_email || null,
    grantedScopes: data?.granted_scopes || null,
    needsReconnect: Boolean(
      data?.refresh_token_encrypted && !hasRequiredGoogleDriveScopes(data.granted_scopes),
    ),
    connectedAt: data?.connected_at || null,
    disconnectedAt: data?.disconnected_at || null,
    envRefreshTokenFallback: Boolean(process.env.GOOGLE_REFRESH_TOKEN?.trim()),
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
      try {
        const folder = await getDriveFolder(rootFolderId)
        rootFolderId = folder.id
        rootFolderName = folder.name
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('File not found:')) {
          throw new Error(
            'This folder is not available to the connected Google Drive app. Use Create New Root for the secure recommended setup.',
          )
        }
        throw error
      }
    } else if (body.initializeRoot) {
      const folder = await initializeDriveRootFolder(admin)
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
      .select('root_folder_id,root_folder_name,portal_expiry_days,account_email,connected_at,updated_at')
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
