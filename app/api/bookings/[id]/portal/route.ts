import { NextResponse } from 'next/server'

import { requireWorkflowAuth } from '@/lib/auth-api'
import { getProvisioningSnapshot } from '@/lib/booking-provisioning'
import { privateNoStoreHeaders } from '@/lib/security/request-security'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { access, error: authError } = await requireWorkflowAuth('view', request)
  if (authError || !access) return authError

  const { id: encodedId } = await params
  const id = decodeURIComponent(encodedId)
  const admin = getSupabaseAdmin()
  if (!admin) {
    return NextResponse.json(
      { error: 'The Client Portal service is temporarily unavailable.' },
      { status: 503, headers: privateNoStoreHeaders() },
    )
  }

  const { data: booking } = await admin
    .from('bookings')
    .select('id')
    .eq('id', id)
    .eq('workspace_id', access.workspaceId)
    .maybeSingle()
  if (!booking) {
    return NextResponse.json(
      { error: 'Client Portal not found.' },
      { status: 404, headers: privateNoStoreHeaders() },
    )
  }

  const snapshot = await getProvisioningSnapshot(id)
  if (!snapshot?.clientPortalUrl) {
    const listUrl = new URL('/editor/client-portals', request.url)
    listUrl.searchParams.set('search', id)
    return NextResponse.redirect(listUrl, { headers: privateNoStoreHeaders() })
  }

  return NextResponse.redirect(snapshot.clientPortalUrl, { headers: privateNoStoreHeaders() })
}
