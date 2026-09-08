import { requireWorkflowAuth } from '@/lib/auth-api'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { mapDbBookingToModel } from '@/lib/booking-db'
import { graduationPackageIds } from '@/lib/package-workflow-server'

export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }
// Only workflow fields: no receipts, payment history or private staff notes.
const columns = 'id,customer_name,customer_email,package_id,package_name,booking_date,booking_time,slot_id,booking_status,created_at,drive_link,raw_photo_link,raw_photo_status,raw_photo_notes,raw_photo_submitted_at,raw_photo_approved_at,edited_photo_link,edited_photo_delivered_at'
export async function GET(request: Request) {
  const { access, error } = await requireWorkflowAuth('edit', request)
  if (error) return error
  try {
    const admin = getSupabaseAdmin()
    if (!admin) throw new Error('Unavailable')
    const packages = await graduationPackageIds(admin)
    if (!packages.length) return Response.json([], { headers })
    const rows = []
    for (let offset = 0; ; offset += 1000) {
      const { data, error: readError } = await admin.from('bookings').select(columns)
        .eq('workspace_id', access!.workspaceId).in('package_id', packages)
        .order('id').range(offset, offset + 999)
      if (readError) throw readError
      rows.push(...(data || []).map(mapDbBookingToModel))
      if (!data || data.length < 1000) break
    }
    return Response.json(rows, { headers })
  } catch (error) {
    console.error('Filtering read failed:', error)
    return Response.json({ error: 'Could not load selections. Try: refresh the page.' }, { status: 503, headers })
  }
}
