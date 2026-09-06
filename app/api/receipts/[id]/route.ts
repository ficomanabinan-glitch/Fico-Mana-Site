import { NextRequest, NextResponse } from 'next/server'
import { requireStaffAuth } from '@/lib/auth-api'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { API_RATE_LIMITS, enforceApiRateLimit } from '@/lib/security/api-rate-limit'
import { privateNoStoreHeaders } from '@/lib/security/request-security'
import { storagePathFromLegacyReceiptUrl } from '@/lib/security/receipt-reference'
import { recordSecurityAuditEvent } from '@/lib/security/security-audit'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireStaffAuth()
  if (auth.error || !auth.user) {
    return auth.error || NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }
  const { id } = await params
  const limited = await enforceApiRateLimit(request, API_RATE_LIMITS.receiptAccess, [auth.user.id, id])
  if (limited) return limited

  const admin = getSupabaseAdmin()
  if (!admin) {
    return NextResponse.json({ error: 'Receipt access is unavailable.' }, { status: 503, headers: privateNoStoreHeaders() })
  }

  let record: { id?: string; booking_id?: string; file_url?: string; storage_path?: string; file_name?: string } | null = null
  if (UUID.test(id)) {
    const { data } = await admin
      .from('receipt_fingerprints')
      .select('id,booking_id,file_url,storage_path,file_name')
      .eq('id', id)
      .maybeSingle()
    record = data
  } else if (id === 'view') {
    const reference = request.nextUrl.searchParams.get('ref')?.trim() || ''
    if (!reference || reference.length > 3_000) {
      return NextResponse.json({ error: 'Receipt not found.' }, { status: 404, headers: privateNoStoreHeaders() })
    }
    const { data } = await admin
      .from('receipt_fingerprints')
      .select('id,booking_id,file_url,storage_path,file_name')
      .eq('file_url', reference)
      .maybeSingle()
    record = data
    if (!record) {
      const { data: booking } = await admin.from('bookings').select('id,receipt_url').eq('receipt_url', reference).maybeSingle()
      if (booking) record = { booking_id: String(booking.id), file_url: String(booking.receipt_url) }
    }
  }

  const storagePath = record?.storage_path || (record?.file_url ? storagePathFromLegacyReceiptUrl(record.file_url) : null)
  if (!record?.booking_id || !storagePath) {
    return NextResponse.json({ error: 'Receipt not found.' }, { status: 404, headers: privateNoStoreHeaders() })
  }

  const { data, error } = await admin.storage.from('receipts').createSignedUrl(storagePath, 120, {
    download: request.nextUrl.searchParams.get('download') === '1' ? record.file_name || 'receipt' : false,
  })
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: 'Receipt is temporarily unavailable.' }, { status: 503, headers: privateNoStoreHeaders() })
  }

  await recordSecurityAuditEvent({
    eventType: 'receipt_accessed',
    outcome: 'success',
    actorId: auth.user.id,
    bookingId: record.booking_id,
    route: '/api/receipts/[id]',
  })
  const response = NextResponse.redirect(data.signedUrl, 307)
  Object.entries(privateNoStoreHeaders()).forEach(([key, value]) => response.headers.set(key, value))
  response.headers.set('Referrer-Policy', 'no-referrer')
  return response
}
