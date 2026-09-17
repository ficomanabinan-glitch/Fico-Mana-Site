import { NextResponse } from 'next/server'
import { requireWorkflowAuth } from '@/lib/auth-api'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { hasPortalExpired } from '@/lib/portal-expiry'
import { secureErrorResponse } from '@/lib/security/error-response'
import { graduationPackageIds } from '@/lib/package-workflow-server'
import { isR2Configured } from '@/lib/storage/r2-client'

export async function GET() {
  const { access, error: authError } = await requireWorkflowAuth('edit')
  if (authError || !access) return authError
  try {
    const admin = getSupabaseAdmin()
    if (!admin) return NextResponse.json({ error: 'This service is temporarily unavailable. Try: refresh the page, or contact your administrator.' }, { status: 500 })
    const eligiblePackageIds = await graduationPackageIds(admin)
    const [{ data: bookings, error: bookingsError }, { data: states, error: statesError }, { data: portals, error: portalsError }, { data: settings, error: settingsError }] = await Promise.all([
      admin.from('bookings')
        .select('id,customer_name,customer_email,booking_date,package_name,booking_status,payment_status,deposit_amount,price,created_at')
        .eq('workspace_id', access.workspaceId)
        .in('package_id', eligiblePackageIds.length ? eligiblePackageIds : ['__no_graduation_packages__'])
        .order('booking_date', { ascending: true }),
      admin.from('booking_provisioning').select('booking_id,status,storage_provider,storage_status,storage_prefix,last_error,provisioned_at,last_retry_at').eq('workspace_id', access.workspaceId),
      admin.from('client_portals').select('id,public_id,booking_id,status,expires_at,created_at,last_accessed_at').eq('workspace_id', access.workspaceId),
      admin.from('storage_settings').select('portal_expiry_days,signed_url_ttl_seconds').eq('id', 1).maybeSingle(),
    ])
    if (bookingsError) throw new Error(bookingsError.message)
    // Failed reads must not turn into reassuring empty/missing status displays.
    if (statesError || portalsError || settingsError) throw new Error(statesError?.message || portalsError?.message || settingsError?.message)
    const stateMap = new Map((states || []).map(row => [String(row.booking_id), row]))
    const portalMap = new Map((portals || []).map(row => [String(row.booking_id), row]))
    const items = (bookings || []).map(booking => {
      const state = stateMap.get(String(booking.id))
      const portal = portalMap.get(String(booking.id))
      const portalExpired = hasPortalExpired(portal?.expires_at)
      return {
        bookingId: String(booking.id), customerName: String(booking.customer_name), customerEmail: String(booking.customer_email),
        shootDate: String(booking.booking_date), packageName: String(booking.package_name),
        bookingStatus: String(booking.booking_status), paymentStatus: String(booking.payment_status),
        requiredDeposit: Number(booking.deposit_amount || 0), price: Number(booking.price || 0),
        provisioningStatus: state?.status || 'NOT_STARTED', storageProvider: state?.storage_provider || null,
        storageStatus: state?.storage_status || 'not_prepared', storagePrefix: state?.storage_prefix || null,
        lastError: state?.last_error || null, provisionedAt: state?.provisioned_at || null, lastRetryAt: state?.last_retry_at || null,
        portal: portal ? {
          id: portal.id, publicId: portal.public_id, status: portalExpired ? 'expired' : portal.status,
          expiresAt: portal.expires_at, createdAt: portal.created_at, lastAccessedAt: portal.last_accessed_at,
        } : null,
      }
    })
    return NextResponse.json({
      items,
      storage: {
        provider: 'Cloudflare R2', configured: isR2Configured(), privateBucket: true,
        portalExpiryDays: Number(settings?.portal_expiry_days || 30),
        signedUrlTtlSeconds: Number(settings?.signed_url_ttl_seconds || 600),
      },
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return secureErrorResponse(error, 'Could not load provisioning overview.', { context: 'GET /api/provisioning' })
  }
}
