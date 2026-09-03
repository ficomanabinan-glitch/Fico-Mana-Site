import { NextResponse } from 'next/server'
import { emailsMatch, loadBookingById } from '@/lib/booking-load'
import { isValidBookingId, resolveBookingReference } from '@/lib/booking-id'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { isSupabaseConfigured } from '@/lib/supabase/env'
import { supabase } from '@/lib/supabase'

const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
])

async function uploadToStorage(file: File, fileName: string) {
  const buffer = Buffer.from(await file.arrayBuffer())
  const options = {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  }

  const admin = getSupabaseAdmin()
  if (admin) {
    const { error } = await admin.storage.from('receipts').upload(fileName, buffer, options)
    if (!error) return admin.storage.from('receipts').getPublicUrl(fileName).data.publicUrl
    console.error('Admin receipt upload error:', error)
  }

  const { error } = await supabase.storage.from('receipts').upload(fileName, buffer, options)
  if (error) {
    console.error('Anon receipt upload error:', error)
    return null
  }
  return supabase.storage.from('receipts').getPublicUrl(fileName).data.publicUrl
}

export async function POST(request: Request) {
  try {
    const form = await request.formData()
    const rawBookingId = String(form.get('bookingId') ?? '').trim()
    const bookingId = resolveBookingReference(rawBookingId)
    const email = String(form.get('email') ?? '').trim()
    const file = form.get('file')

    if (!rawBookingId || !(file instanceof File)) {
      return NextResponse.json({ error: 'Booking reference and file are required.' }, { status: 400 })
    }

    if (!isValidBookingId(bookingId) && !bookingId.startsWith('FM-W')) {
      return NextResponse.json({ error: 'Invalid booking reference.' }, { status: 400 })
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File must be 5 MB or smaller.' }, { status: 400 })
    }

    if (file.type && !ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: 'Upload a JPG, PNG, WEBP, GIF, or PDF file.' }, { status: 400 })
    }

    const booking = await loadBookingById(bookingId)

    if (booking) {
      if (!email || !emailsMatch(booking.customerEmail, email)) {
        return NextResponse.json({ error: 'Booking not found.' }, { status: 404 })
      }
      if (booking.bookingStatus !== 'Pending Payment') {
        return NextResponse.json({ error: 'This booking is not awaiting a new receipt.' }, { status: 409 })
      }
    } else if (!email) {
      return NextResponse.json({ error: 'Email is required for new bookings.' }, { status: 400 })
    }

    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Storage is not configured.' }, { status: 503 })
    }

    const safeName = file.name.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9._-]/g, '')
    const fileName = `${bookingId}-${Date.now()}-${safeName || 'receipt'}`
    const receiptUrl = await uploadToStorage(file, fileName)

    if (!receiptUrl) {
      return NextResponse.json(
        {
          error:
            'Failed to upload receipt. Run migration 004 in Supabase and set SUPABASE_SERVICE_ROLE_KEY on Vercel.',
        },
        { status: 500 },
      )
    }

    return NextResponse.json({ receiptUrl })
  } catch (error) {
    console.error('POST /api/receipts/upload', error)
    return NextResponse.json({ error: 'Failed to upload receipt.' }, { status: 500 })
  }
}
