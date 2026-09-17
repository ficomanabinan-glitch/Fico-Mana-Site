import { NextResponse } from 'next/server'

import { requireStaffAuth } from '@/lib/auth-api'
import { getProvisioningSnapshot } from '@/lib/booking-provisioning'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireStaffAuth(request)
  if (error) return error

  const { id } = await params
  const snapshot = await getProvisioningSnapshot(decodeURIComponent(id))
  if (!snapshot?.clientPortalUrl) {
    return NextResponse.redirect(new URL(`/editor/client-portals?search=${encodeURIComponent(id)}`, 'https://editor.ficomana.com'))
  }

  return NextResponse.redirect(snapshot.clientPortalUrl)
}
