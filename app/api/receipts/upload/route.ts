import { createHash, randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { requireStaffAuth } from '@/lib/auth-api'
import { emailsMatch, loadBookingById } from '@/lib/booking-load'
import { isValidBookingId, resolveBookingReference } from '@/lib/booking-id'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { isSupabaseConfigured } from '@/lib/supabase/env'
import { API_RATE_LIMITS, enforceApiRateLimit } from '@/lib/security/api-rate-limit'
import { validateReceiptImageContent } from '@/lib/security/file-validation'
import { privateNoStoreHeaders, rejectUntrustedMutation } from '@/lib/security/request-security'
import { recordSecurityAuditEvent } from '@/lib/security/security-audit'
import { scanUpload } from '@/lib/security/upload-scanner'

const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
])
const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif'])

async function uploadToStorage(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  file: File,
  buffer: Buffer,
  fileName: string,
) {
  const options = {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  }

  const { error } = await admin.storage.from('receipts').upload(fileName, buffer, options)
  if (error) {
    console.error('Admin receipt upload error:', error)
    return null
  }
  return fileName
}

async function duplicateImageResponse(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  receiptHash: string,
  bookingId: string,
) {
  const { data, error } = await admin
    .from('receipt_fingerprints')
    .select('id,booking_id,file_url,storage_path')
    .eq('sha256', receiptHash)
    .maybeSingle()

  if (error) throw error
  if (!data || String(data.booking_id) === bookingId) return null

  // A public booking uploads its receipt before the booking row is created. If
  // validation interrupted that second request, the fingerprint is orphaned
  // and a refreshed form would otherwise report the customer's own receipt as
  // a duplicate. Reassign only verified orphaned uploads; fingerprints owned
  // by an actual booking remain immutable and protected by the duplicate check.
  const previousBookingId = String(data.booking_id)
  const { data: previousBooking, error: previousBookingError } = await admin
    .from('bookings')
    .select('id')
    .eq('id', previousBookingId)
    .maybeSingle()

  if (previousBookingError) throw previousBookingError
  if (!previousBooking && data.storage_path) {
    const { data: reassigned, error: reassignError } = await admin
      .from('receipt_fingerprints')
      .update({ booking_id: bookingId })
      .eq('id', String(data.id))
      .eq('booking_id', previousBookingId)
      .select('id')
      .maybeSingle()

    if (reassignError) throw reassignError
    if (reassigned) {
      return NextResponse.json(
        {
          receiptUrl: `/api/receipts/${String(reassigned.id)}`,
          receiptHash,
          recovered: true,
        },
        { headers: privateNoStoreHeaders() },
      )
    }
  }

  return NextResponse.json(
    {
      error: 'This exact receipt image has already been submitted for another booking. Please upload the correct payment receipt.',
      code: 'DUPLICATE_RECEIPT_IMAGE',
    },
    { status: 409, headers: privateNoStoreHeaders() },
  )
}

export async function POST(request: Request) {
  try {
    const originError = rejectUntrustedMutation(request)
    if (originError) return originError
    const form = await request.formData()
    const rawBookingId = String(form.get('bookingId') ?? '').trim()
    const bookingId = resolveBookingReference(rawBookingId)
    const email = String(form.get('email') ?? '').trim()
    const file = form.get('file')
    const staffAuth = email ? null : await requireStaffAuth()
    const isStaffUpload = Boolean(staffAuth?.user && !staffAuth.error)

    if (!rawBookingId || !(file instanceof File)) {
      return NextResponse.json({ error: 'Booking reference and receipt image are required.' }, { status: 400 })
    }

    const limited = await enforceApiRateLimit(request, API_RATE_LIMITS.receiptUpload, [bookingId])
    if (limited) return limited

    if (!isValidBookingId(bookingId) && !bookingId.startsWith('FM-W')) {
      return NextResponse.json({ error: 'Invalid booking reference.' }, { status: 400 })
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Receipt image must be 5 MB or smaller.' }, { status: 400 })
    }

    const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!ALLOWED_TYPES.has(file.type) || !ALLOWED_EXTENSIONS.has(extension)) {
      return NextResponse.json(
        { error: 'Upload a receipt image only: JPG, JPEG, PNG, WEBP, or GIF.' },
        { status: 400 },
      )
    }

    const booking = await loadBookingById(bookingId)

    if (booking) {
      if (!isStaffUpload && (!email || !emailsMatch(booking.customerEmail, email))) {
        return NextResponse.json({ error: 'Booking not found.' }, { status: 404 })
      }
      if (booking.bookingStatus !== 'Pending Payment') {
        return NextResponse.json({ error: 'This booking is not awaiting a new receipt.' }, { status: 409 })
      }
    } else if (!email && !isStaffUpload) {
      return NextResponse.json({ error: 'Email is required for new bookings.' }, { status: 400 })
    }

    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Storage is not configured.' }, { status: 503 })
    }

    const admin = getSupabaseAdmin()
    if (!admin) {
      return NextResponse.json(
        { error: 'Secure receipt verification is unavailable. Please try again later.' },
        { status: 503 },
      )
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    try {
      await validateReceiptImageContent(buffer, file.type, file.name)
    } catch (error) {
      await recordSecurityAuditEvent({
        eventType: 'suspicious_file_rejected',
        outcome: 'blocked',
        bookingId,
        route: '/api/receipts/upload',
        metadata: { purpose: 'payment-receipt', reason: error instanceof Error ? error.message : 'invalid_content' },
      })
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Invalid receipt image.' },
        { status: 415, headers: privateNoStoreHeaders() },
      )
    }

    const scan = await scanUpload({ buffer, fileName: file.name, mimeType: file.type, purpose: 'payment-receipt' })
    if (scan.status === 'rejected') {
      await recordSecurityAuditEvent({
        eventType: 'malware_scan_rejection',
        outcome: 'blocked',
        bookingId,
        route: '/api/receipts/upload',
        metadata: { purpose: 'payment-receipt' },
      })
      return NextResponse.json({ error: scan.reason }, { status: 415, headers: privateNoStoreHeaders() })
    }
    const receiptHash = createHash('sha256').update(buffer).digest('hex')

    const duplicate = await duplicateImageResponse(admin, receiptHash, bookingId)
    if (duplicate) return duplicate

    const { data: existingFingerprint } = await admin
      .from('receipt_fingerprints')
      .select('id,booking_id,file_url,storage_path')
      .eq('sha256', receiptHash)
      .maybeSingle()

    if (existingFingerprint && String(existingFingerprint.booking_id) === bookingId) {
      return NextResponse.json(
        { receiptUrl: `/api/receipts/${String(existingFingerprint.id)}`, receiptHash },
        { headers: privateNoStoreHeaders() },
      )
    }

    let reservedFingerprint = false
    const fingerprintId = randomUUID()
    const receiptReference = `/api/receipts/${fingerprintId}`
    const safeName = file.name.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9._-]/g, '')
    const fileName = `${fingerprintId}/${bookingId}-${Date.now()}-${safeName || 'receipt'}`
    if (!existingFingerprint) {
      const { error: reserveError } = await admin.from('receipt_fingerprints').insert({
        id: fingerprintId,
        booking_id: bookingId,
        sha256: receiptHash,
        file_url: receiptReference,
        storage_path: fileName,
        file_name: file.name,
        file_size: file.size,
      })

      if (reserveError) {
        if (reserveError.code === '23505') {
          const racedDuplicate = await duplicateImageResponse(admin, receiptHash, bookingId)
          if (racedDuplicate) return racedDuplicate
          const { data: racedFingerprint } = await admin
            .from('receipt_fingerprints')
            .select('id,booking_id')
            .eq('sha256', receiptHash)
            .maybeSingle()
          if (racedFingerprint && String(racedFingerprint.booking_id) === bookingId) {
            return NextResponse.json(
              {
                receiptUrl: `/api/receipts/${String(racedFingerprint.id)}`,
                receiptHash,
              },
              { headers: privateNoStoreHeaders() },
            )
          }
          return NextResponse.json(
            { error: 'Could not verify receipt uniqueness. Please try again.' },
            { status: 409, headers: privateNoStoreHeaders() },
          )
        } else {
          console.error('Receipt fingerprint reservation failed:', reserveError)
          return NextResponse.json(
            { error: 'Could not verify receipt uniqueness. Please try again.' },
            { status: 500 },
          )
        }
      } else {
        reservedFingerprint = true
      }
    }

    const storagePath = await uploadToStorage(admin, file, buffer, fileName)

    if (!storagePath) {
      if (reservedFingerprint) {
        await admin
          .from('receipt_fingerprints')
          .delete()
          .eq('booking_id', bookingId)
          .eq('sha256', receiptHash)
      }
      return NextResponse.json(
        {
          error:
            'Your receipt could not be uploaded. Try: upload it again, or contact the studio if the problem continues.',
        },
        { status: 500 },
      )
    }

    const { error: fingerprintUpdateError } = await admin
      .from('receipt_fingerprints')
      .update({
        file_url: receiptReference,
        storage_path: storagePath,
        file_name: file.name,
        file_size: file.size,
      })
      .eq('booking_id', bookingId)
      .eq('sha256', receiptHash)

    if (fingerprintUpdateError) {
      console.error('Receipt fingerprint update failed:', fingerprintUpdateError)
      await admin.storage.from('receipts').remove([storagePath])
      if (reservedFingerprint) {
        await admin.from('receipt_fingerprints').delete().eq('id', fingerprintId)
      }
      return NextResponse.json(
        { error: 'Receipt verification could not be completed. Please try again.' },
        { status: 500, headers: privateNoStoreHeaders() },
      )
    }

    await recordSecurityAuditEvent({
      eventType: 'receipt_uploaded',
      outcome: 'success',
      bookingId,
      actorId: isStaffUpload ? staffAuth?.user?.id : null,
      route: '/api/receipts/upload',
      metadata: { scanner: scan.status },
    })
    return NextResponse.json(
      { receiptUrl: receiptReference, receiptHash },
      { headers: privateNoStoreHeaders() },
    )
  } catch (error) {
    console.error('POST /api/receipts/upload', error)
    return NextResponse.json({ error: 'Failed to upload receipt.' }, { status: 500 })
  }
}
