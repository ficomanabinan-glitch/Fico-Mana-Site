import { NextResponse } from 'next/server'
import { requireStaffAuth } from '@/lib/auth-api'
import {
  disableClientPortal,
  enableClientPortal,
  getProvisioningSnapshot,
  provisionBookingResources,
} from '@/lib/booking-provisioning'
import { secureErrorResponse } from '@/lib/security/error-response'
import { assertGraduationBooking } from '@/lib/package-workflow-server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { GraduationWorkflowOnlyError } from '@/lib/package-workflow'
import { privateNoStoreHeaders } from '@/lib/security/request-security'

type Body = { action?: 'provision' | 'retry' | 'disable_portal' | 'enable_portal' }

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error: authError } = await requireStaffAuth()
  if (authError) return authError
  const { id } = await params
  const snapshot = await getProvisioningSnapshot(id)
  if (!snapshot) return NextResponse.json({ error: 'Provisioning state unavailable.' }, { status: 404 })
  return NextResponse.json(snapshot)
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, error: authError } = await requireStaffAuth(request)
  if (authError) return authError

  try {
    const { id } = await params
    const body = (await request.json().catch(() => ({}))) as Body
    const action = body.action || 'retry'
    const actor = { type: 'staff' as const, id: user?.id || null }

    if (action !== 'disable_portal') {
      const admin = getSupabaseAdmin()
      if (!admin) throw new Error('Service unavailable.')
      await assertGraduationBooking(admin, id)
    }

    if (action === 'disable_portal') await disableClientPortal(id, actor)
    else if (action === 'enable_portal') await enableClientPortal(id, actor)
    else return NextResponse.json(await provisionBookingResources(id, actor))

    return NextResponse.json(await getProvisioningSnapshot(id))
  } catch (error) {
    if (error instanceof GraduationWorkflowOnlyError) return NextResponse.json({ error: error.message }, { status: 409, headers: privateNoStoreHeaders() })
    return secureErrorResponse(error, 'Provisioning action failed.', {
      request,
      context: 'POST /api/bookings/[id]/provisioning',
    })
  }
}
