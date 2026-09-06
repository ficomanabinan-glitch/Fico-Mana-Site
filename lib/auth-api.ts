import { NextResponse } from 'next/server'
import { getAdminAuthContext, getStaffUser } from '@/lib/supabase/server'
import {
  canUseWorkflow,
  getWorkflowAccess,
  type WorkflowCapability,
} from '@/lib/auth/workflow'
import { rejectUntrustedMutation } from '@/lib/security/request-security'

/** API authorization is server-side RBAC, not merely "has a Supabase session". */
export async function requireStaffAuth(
  request?: Request,
  options: { requireMfa?: boolean } = {},
) {
  const originError = request ? rejectUntrustedMutation(request) : null
  if (originError) return { user: null, assurance: null, error: originError }

  const { user, assurance } = await getAdminAuthContext()
  if (!user) {
    return { user: null, assurance, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  if (options.requireMfa !== false && assurance?.currentLevel !== 'aal2') {
    return {
      user,
      assurance,
      error: NextResponse.json(
        { error: 'Multi-factor verification is required.', code: 'MFA_REQUIRED', mfaUrl: '/admin/mfa' },
        { status: 428, headers: { 'Cache-Control': 'private, no-store, max-age=0' } },
      ),
    }
  }
  return { user, assurance, error: null }
}

/** Editor-portal authorization uses workspace membership, not editable client metadata. */
export async function requireWorkflowAuth(capability: WorkflowCapability = 'view', request?: Request) {
  const originError = request ? rejectUntrustedMutation(request) : null
  if (originError) {
    return { user: null, access: null, error: originError }
  }
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
