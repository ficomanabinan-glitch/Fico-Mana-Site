import { NextResponse } from 'next/server'
import { requireStaffAuth } from '@/lib/auth-api'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { googleOAuthAppConfigured } from '@/lib/google-oauth'

export async function GET() {
  const { error: authError } = await requireStaffAuth()
  if (authError) return authError

  try {
    const admin = getSupabaseAdmin()
    if (!admin) return NextResponse.json({ error: 'Database admin client unavailable.' }, { status: 500 })

    const [{ data: bookings, error: bookingsError }, { data: states }, { data: portals }, { data: settings }] = await Promise.all([
      admin
        .from('bookings')
        .select('id,customer_name,customer_email,booking_date,package_name,booking_status,payment_status,deposit_amount,price,drive_link,created_at')
        .order('booking_date', { ascending: true }),
      admin.from('booking_provisioning').select('*'),
      admin.from('client_portals').select('id,public_id,booking_id,status,expires_at,created_at,last_accessed_at'),
      admin
        .from('google_drive_settings')
        .select('root_folder_id,root_folder_name,portal_expiry_days,account_email,refresh_token_encrypted,connected_at,updated_at')
        .eq('id', 1)
        .maybeSingle(),
    ])
    if (bookingsError) throw new Error(bookingsError.message)

    const stateMap = new Map((states || []).map((row) => [String(row.booking_id), row]))
    const portalMap = new Map((portals || []).map((row) => [String(row.booking_id), row]))

    const items = (bookings || []).map((booking) => {
      const state = stateMap.get(String(booking.id))
      const portal = portalMap.get(String(booking.id))
      return {
        bookingId: String(booking.id),
        customerName: String(booking.customer_name),
        customerEmail: String(booking.customer_email),
        shootDate: String(booking.booking_date),
        packageName: String(booking.package_name),
        bookingStatus: String(booking.booking_status),
        paymentStatus: String(booking.payment_status),
        requiredDeposit: Number(booking.deposit_amount || 0),
        price: Number(booking.price || 0),
        clientGalleryLink: booking.drive_link || null,
        provisioningStatus: state?.status || 'NOT_STARTED',
        driveClientFolderId: state?.drive_client_folder_id || null,
        driveClientFolderUrl: state?.drive_client_folder_url || null,
        lastError: state?.last_error || null,
        provisionedAt: state?.provisioned_at || null,
        lastRetryAt: state?.last_retry_at || null,
        portal: portal
          ? {
              id: portal.id,
              publicId: portal.public_id,
              status: portal.status,
              expiresAt: portal.expires_at,
              createdAt: portal.created_at,
              lastAccessedAt: portal.last_accessed_at,
            }
          : null,
      }
    })

    return NextResponse.json({
      items,
      googleDrive: {
        rootFolderId: settings?.root_folder_id || null,
        rootFolderName: settings?.root_folder_name || 'FICOMANA SHOOTS',
        portalExpiryDays: Number(settings?.portal_expiry_days || 30),
        oauthAppConfigured: googleOAuthAppConfigured(),
        connected: Boolean(settings?.refresh_token_encrypted || process.env.GOOGLE_REFRESH_TOKEN?.trim()),
        accountEmail: settings?.account_email || (process.env.GOOGLE_REFRESH_TOKEN?.trim() ? 'Environment connection' : null),
        connectedAt: settings?.connected_at || null,
      },
    })
  } catch (error) {
    console.error('GET /api/provisioning', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not load provisioning overview.' },
      { status: 500 },
    )
  }
}
