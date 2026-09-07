import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireStaffAuth } from '@/lib/auth-api'
import { canUseWorkflow, getWorkflowAccess } from '@/lib/auth/workflow'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { enforceApiRateLimit } from '@/lib/security/api-rate-limit'
import { privateNoStoreHeaders } from '@/lib/security/request-security'
import { readBoundedResponse } from '@/lib/security/outbound-url'
import { CLEANUP_CONFIRMATION, cleanupCategoriesSchema, cleanupRangeSchema, verifyCleanupGrant } from '@/lib/shoot-storage-cleanup'
import { FOLDER_CLEANUP_CONFIRMATION, verifyCleanupFolderGrant } from '@/lib/shoot-folder-cleanup'
import { executeCleanupShoot, executeCleanupShootFolder, listCleanupShoots, previewCleanupShoot, previewCleanupShootFolder } from '@/lib/shoot-storage-cleanup-server'

export const runtime = 'nodejs'
export const maxDuration = 120

const querySchema = z.object({
  range: cleanupRangeSchema, cursor: z.string().max(160).default(''),
  bookingId: z.string().min(1).max(160).optional(), categories: cleanupCategoriesSchema.optional(),
  scope: z.enum(['files', 'folder']).default('files'),
})
const bodySchema = z.object({ token: z.string().min(1).max(40_000), confirmation: z.enum([CLEANUP_CONFIRMATION, FOLDER_CLEANUP_CONFIRMATION]) }).strict()

async function handle(request: Request, execute: boolean) {
  const headers = privateNoStoreHeaders()
  const { user, error: authError } = await requireStaffAuth(request)
  if (authError) return authError
  try {
    const access = await getWorkflowAccess(user!)
    if (!access || !canUseWorkflow(access, 'admin')) return NextResponse.json({ error: 'Only an administrator can clear shoot storage.' }, { status: 403, headers })
    const limited = await enforceApiRateLimit(request, {
      name: execute ? 'shoot-storage-clear' : 'shoot-storage-review', limit: execute ? 150 : 300,
      windowSeconds: 300, failClosed: true,
    }, [user!.id, access.workspaceId])
    if (limited) return limited
    const admin = getSupabaseAdmin()
    if (!admin) throw new Error('Storage service unavailable.')
    if (execute) {
      if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
        return NextResponse.json({ error: 'Send a valid cleanup confirmation.' }, { status: 415, headers })
      }
      // Bound the stream, not just a claimed Content-Length or an already allocated string.
      let text: string
      try { text = (await readBoundedResponse(new Response(request.body), 42_000)).toString('utf8') }
      catch { return NextResponse.json({ error: 'Cleanup confirmation is empty or too large.' }, { status: 413, headers }) }
      let body: unknown
      try { body = JSON.parse(text) } catch { body = null }
      const parsed = bodySchema.safeParse(body)
      if (!parsed.success) return NextResponse.json({ error: 'Review your selection and type the exact confirmation shown in the dialog.' }, { status: 400, headers })
      if (parsed.data.confirmation === FOLDER_CLEANUP_CONFIRMATION) {
        const grant = verifyCleanupFolderGrant(parsed.data.token, access.workspaceId, user!.id)
        return NextResponse.json({ results: await executeCleanupShootFolder(admin, grant) }, { headers })
      }
      const grant = verifyCleanupGrant(parsed.data.token, access.workspaceId, user!.id)
      return NextResponse.json({ results: await executeCleanupShoot(admin, grant) }, { headers })
    }
    const params = new URL(request.url).searchParams
    const parsed = querySchema.safeParse({ range: params.get('range'), cursor: params.get('cursor') || '',
      scope: params.get('scope') || 'files',
      bookingId: params.get('bookingId') || undefined, categories: params.has('categories') ? params.get('categories')!.split(',') : undefined })
    if (!parsed.success) return NextResponse.json({ error: 'Choose a time range and at least one file category.' }, { status: 400, headers })
    const { range, cursor, bookingId, categories, scope } = parsed.data
    if (scope === 'folder' && categories) return NextResponse.json({ error: 'Entire shoot folder includes all file types. Try: remove the category filter and review again.' }, { status: 400, headers })
    if (bookingId && scope === 'files' && !categories) return NextResponse.json({ error: 'Choose at least one file category.' }, { status: 400, headers })
    const result = bookingId
      ? scope === 'folder' ? await previewCleanupShootFolder(admin, access.workspaceId, user!.id, bookingId, range)
        : await previewCleanupShoot(admin, access.workspaceId, user!.id, bookingId, range, categories!)
      : await listCleanupShoots(admin, access.workspaceId, range, cursor)
    return NextResponse.json(result, { headers })
  } catch {
    return NextResponse.json({ error: execute
      ? 'Cleanup was not fully confirmed. The portal may be disabled and selected files or folders may already be in Trash. Try: check Google Drive Trash and review again; moved, changed, or expired targets need a new review.'
      : 'The shoot storage could not be reviewed. Nothing was deleted. Try: check Drive access, finish any uploads, and check the folder settings in Client Portals. Already-trashed or changed folders need a fresh review.' }, { status: 409, headers })
  }
}

export function GET(request: Request) { return handle(request, false) }
export function POST(request: Request) { return handle(request, true) }
