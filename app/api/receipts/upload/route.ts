import { createHash } from 'crypto'
import { NextResponse } from 'next/server'
import { requireStaffAuth } from '@/lib/auth-api'
import { emailsMatch, loadBookingById } from '@/lib/booking-load'
import { isValidBookingId, resolveBookingReference } from '@/lib/booking-id'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { isSupabaseConfigured } from '@/lib/supabase/env'

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
  return admin.storage.from('receipts').getPublicUrl(fileName).data.publicUrl
}

async function duplicateImageResponse(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  receiptHash: string,
  bookingId: string,
) {
  const { data, error } = await admin
    .from('receipt_fingerprints')
    .select('booking_id')
    .eq('sha256', receiptHash)
    .maybeSingle()

  if (error) throw error
  if (!data || String(data.booking_id) === bookingId) return null

  const duplicateBookingId = String(data.booking_id)
  return NextResponse.json(
    {
      error: `This exact receipt image has already been submitted for booking ${duplicateBookingId}. Please upload the correct payment receipt.`,
      code: 'DUPLICATE_RECEIPT_IMAGE',
      duplicateBookingId,
    },
    { status: 409 },
  )
}

export async function POST(request: Request) {
  try {
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
    const receiptHash = createHash('sha256').update(buffer).digest('hex')

    const duplicate = await duplicateImageResponse(admin, receiptHash, bookingId)
    if (duplicate) return duplicate

    const { data: existingFingerprint } = await admin
      .from('receipt_fingerprints')
      .select('booking_id')
      .eq('sha256', receiptHash)
      .maybeSingle()

    let reservedFingerprint = false
    if (!existingFingerprint) {
      const { error: reserveError } = await admin.from('receipt_fingerprints').insert({
        booking_id: bookingId,
        sha256: receiptHash,
        file_url: 'pending',
        file_name: file.name,
        file_size: file.size,
      })

      if (reserveError) {
        if (reserveError.code === '23505') {
          const racedDuplicate = await duplicateImageResponse(admin, receiptHash, bookingId)
          if (racedDuplicate) return racedDuplicate
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

    const safeName = file.name.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9._-]/g, '')
    const fileName = `${bookingId}-${Date.now()}-${safeName || 'receipt'}`
    const receiptUrl = await uploadToStorage(admin, file, buffer, fileName)

    if (!receiptUrl) {
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
            'Failed to upload receipt. Ensure receipt storage is configured and the Supabase server secret is available on Vercel.',
        },
        { status: 500 },
      )
    }

    const { error: fingerprintUpdateError } = await admin
      .from('receipt_fingerprints')
      .update({
        file_url: receiptUrl,
        file_name: file.name,
        file_size: file.size,
      })
      .eq('booking_id', bookingId)
      .eq('sha256', receiptHash)

    if (fingerprintUpdateError) {
      console.error('Receipt fingerprint update failed:', fingerprintUpdateError)
    }

    return NextResponse.json({ receiptUrl, receiptHash })
  } catch (error) {
    console.error('POST /api/receipts/upload', error)
    return NextResponse.json({ error: 'Failed to upload receipt.' }, { status: 500 })
  }
}
