import { NextResponse } from 'next/server'
import { requireStaffAuth } from '@/lib/auth-api'
import {
  disableClientPortal,
  enableClientPortal,
  getProvisioningSnapshot,
  provisionBookingResources,
} from '@/lib/booking-provisioning'

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
  const { user, error: authError } = await requireStaffAuth()
  if (authError) return authError

  try {
    const { id } = await params
    const body = (await request.json().catch(() => ({}))) as Body
    const action = body.action || 'retry'
    const actor = { type: 'staff' as const, id: user?.id || null }

    if (action === 'disable_portal') await disableClientPortal(id, actor)
    else if (action === 'enable_portal') await enableClientPortal(id, actor)
    else return NextResponse.json(await provisionBookingResources(id, actor))

    return NextResponse.json(await getProvisioningSnapshot(id))
  } catch (error) {
    console.error('POST /api/bookings/[id]/provisioning', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Provisioning action failed.' },
      { status: 500 },
    )
  }
}
