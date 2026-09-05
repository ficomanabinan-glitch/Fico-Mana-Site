import { NextResponse } from 'next/server'
import { getAdminUser, getStaffUser } from '@/lib/supabase/server'
import {
  canUseWorkflow,
  getWorkflowAccess,
  type WorkflowCapability,
} from '@/lib/auth/workflow'

/** API authorization is server-side RBAC, not merely "has a Supabase session". */
export async function requireStaffAuth() {
  const user = await getAdminUser()
  if (!user) {
    return { user: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  return { user, error: null }
}

/** Editor-portal authorization uses workspace membership, not editable client metadata. */
export async function requireWorkflowAuth(capability: WorkflowCapability = 'view') {
  const user = await getStaffUser()
  if (!user) {
    return {
      user: null,
      access: null,
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }
  const access = await getWorkflowAccess(user)
  if (!access || !canUseWorkflow(access, capability)) {
    return {
      user,
      access,
      error: NextResponse.json({ error: 'This staff role cannot perform that action.' }, { status: 403 }),
    }
  }
  return { user, access, error: null }
}

/** Minimal booking fields safe to expose publicly for slot availability. */
export type BookingAvailability = {
  id: string
  bookingDate: string
  slotId?: string
  bookingTime?: string
  packageId: string
  packageSlotType?: 'makeup' | 'standard'
  bookingStatus: string
}

export function toAvailability(booking: {
  id: string
  bookingDate: string
  slotId?: string
  bookingTime?: string
  packageId: string
  packageSlotType?: 'makeup' | 'standard'
  bookingStatus: string
}): BookingAvailability {
  return {
    id: booking.id,
    bookingDate: booking.bookingDate,
    slotId: booking.slotId,
    bookingTime: booking.bookingTime,
    packageId: booking.packageId,
    packageSlotType: booking.packageSlotType,
    bookingStatus: booking.bookingStatus,
  }
}
