import type { Booking } from '@/lib/data-store'

export type DbBookingRow = Record<string, unknown>

export function mapDbBookingToModel(b: DbBookingRow): Booking {
  const note = b.note ? String(b.note) : undefined
  let receiptUrl = b.receipt_url ? String(b.receipt_url) : undefined
  let transactionRef =
    b.transaction_ref && String(b.transaction_ref).trim()
      ? String(b.transaction_ref).trim()
      : undefined

  if (note) {
    if (!receiptUrl) {
      const fromNote = note
        .split(' · ')
        .find((p) => p.startsWith('Receipt: '))
        ?.slice('Receipt: '.length)
        .trim()
      if (fromNote && fromNote !== '(receipt on file)') receiptUrl = fromNote
    }
    if (!transactionRef) {
      const fromNote = note
        .split(' · ')
        .find((p) => p.startsWith('TxnRef: '))
        ?.slice('TxnRef: '.length)
        .trim()
      if (fromNote) transactionRef = fromNote
    }
  }

  const paymentHistory =
    typeof b.payment_history === 'string'
      ? JSON.parse(b.payment_history)
      : Array.isArray(b.payment_history)
        ? (b.payment_history as Booking['paymentHistory'])
        : (b.payment_history as Booking['paymentHistory']) || []

  if (!transactionRef && paymentHistory.length) {
    const deposit = paymentHistory.find((p: { type?: string }) => p.type === 'Deposit')
    if (deposit?.transactionRef?.trim()) transactionRef = deposit.transactionRef.trim()
  }

  return {
    id: String(b.id),
    customerName: String(b.customer_name),
    customerEmail: String(b.customer_email),
    customerPhone: String(b.customer_phone),
    customerFbLink: String(b.customer_fb_link || ''),
    customerFbName: String(b.customer_fb_name || ''),
    packageId: String(b.package_id),
    packageName: String(b.package_name),
    bookingDate: String(b.booking_date),
    bookingTime: String(b.booking_time),
    slotId: b.slot_id ? String(b.slot_id) : undefined,
    arrivalTime: b.arrival_time ? String(b.arrival_time) : undefined,
    shootTime: b.shoot_time ? String(b.shoot_time) : undefined,
    isWalkIn: Boolean(b.is_walk_in),
    note,
    staffNotes: b.staff_notes ? String(b.staff_notes) : undefined,
    schoolName: b.school_name ? String(b.school_name) : undefined,
    course: b.course ? String(b.course) : undefined,
    hoodColor: b.hood_color ? String(b.hood_color) : undefined,
    togaColor: b.toga_color ? String(b.toga_color) : undefined,
    tasselColor: b.tassel_color ? String(b.tassel_color) : undefined,
    backgroundColor: b.background_color ? String(b.background_color) : undefined,
    depositAmount: Number(b.deposit_amount),
    price: Number(b.price),
    transactionRef,
    bookingStatus: b.booking_status as Booking['bookingStatus'],
    paymentStatus: b.payment_status as Booking['paymentStatus'],
    rejectionReason: b.rejection_reason ? String(b.rejection_reason) : undefined,
    createdAt: String(b.created_at),
    receiptUrl,
    paymentHistory,
    driveLink: b.drive_link ? String(b.drive_link) : undefined,
    rawPhotoLink: b.raw_photo_link ? String(b.raw_photo_link) : undefined,
    rawPhotoStatus: b.raw_photo_status ? (b.raw_photo_status as Booking['rawPhotoStatus']) : undefined,
    rawPhotoNotes: b.raw_photo_notes ? String(b.raw_photo_notes) : undefined,
    rawPhotoSubmittedAt: b.raw_photo_submitted_at ? String(b.raw_photo_submitted_at) : undefined,
    rawPhotoApprovedAt: b.raw_photo_approved_at ? String(b.raw_photo_approved_at) : undefined,
    editedPhotoLink: b.edited_photo_link ? String(b.edited_photo_link) : undefined,
    editedPhotoDeliveredAt: b.edited_photo_delivered_at
      ? String(b.edited_photo_delivered_at)
      : undefined,
  }
}

export function mapModelBookingToDbCore(b: Booking): Record<string, unknown> {
  const extras: string[] = []
  if (b.slotId) extras.push(`Slot: ${b.slotId}`)
  if (b.arrivalTime) extras.push(`Arrival: ${b.arrivalTime}`)
  if (b.shootTime) extras.push(`Shoot: ${b.shootTime}`)
  if (b.schoolName) extras.push(`School: ${b.schoolName}`)
  if (b.course) extras.push(`Course: ${b.course}`)
  if (b.hoodColor) extras.push(`Hood: ${b.hoodColor}`)
  if (b.togaColor) extras.push(`Toga: ${b.togaColor}`)
  if (b.tasselColor) extras.push(`Tassel: ${b.tasselColor}`)
  if (b.backgroundColor) extras.push(`Background: ${b.backgroundColor}`)
  if (b.transactionRef?.trim()) extras.push(`TxnRef: ${b.transactionRef.trim()}`)
  if (b.receiptUrl) {
    const receiptNote = b.receiptUrl.startsWith('data:') ? '(receipt on file)' : b.receiptUrl
    extras.push(`Receipt: ${receiptNote}`)
  }

  const note = [b.note, ...extras].filter(Boolean).join(' · ')

  return {
    id: b.id,
    customer_name: b.customerName,
    customer_email: b.customerEmail,
    customer_phone: b.customerPhone,
    customer_fb_link: b.customerFbLink,
    customer_fb_name: b.customerFbName,
    package_id: b.packageId,
    package_name: b.packageName,
    booking_date: b.bookingDate,
    booking_time: b.bookingTime,
    note: note || null,
    staff_notes: b.staffNotes ?? null,
    deposit_amount: b.depositAmount,
    price: b.price,
    transaction_ref: b.transactionRef?.trim() || null,
    booking_status: b.bookingStatus,
    payment_status: b.paymentStatus,
    rejection_reason: b.rejectionReason ?? null,
    created_at: b.createdAt,
    drive_link: b.driveLink ?? null,
  }
}

export function mapModelBookingToDb(b: Booking): Record<string, unknown> {
  return {
    id: b.id,
    customer_name: b.customerName,
    customer_email: b.customerEmail,
    customer_phone: b.customerPhone,
    customer_fb_link: b.customerFbLink,
    customer_fb_name: b.customerFbName,
    package_id: b.packageId,
    package_name: b.packageName,
    booking_date: b.bookingDate,
    booking_time: b.bookingTime,
    slot_id: b.slotId ?? null,
    arrival_time: b.arrivalTime ?? null,
    shoot_time: b.shootTime ?? null,
    is_walk_in: b.isWalkIn ?? false,
    note: b.note ?? null,
    staff_notes: b.staffNotes ?? null,
    school_name: b.schoolName ?? null,
    course: b.course ?? null,
    hood_color: b.hoodColor ?? null,
    toga_color: b.togaColor ?? null,
    tassel_color: b.tasselColor ?? null,
    background_color: b.backgroundColor ?? null,
    deposit_amount: b.depositAmount,
    price: b.price,
    transaction_ref: b.transactionRef?.trim() || null,
    booking_status: b.bookingStatus,
    payment_status: b.paymentStatus,
    rejection_reason: b.rejectionReason ?? null,
    created_at: b.createdAt,
    receipt_url:
      Object.prototype.hasOwnProperty.call(b, 'receiptUrl') && !b.receiptUrl
        ? null
        : b.receiptUrl?.startsWith('data:')
          ? null
          : (b.receiptUrl ?? null),
    payment_history: JSON.stringify(b.paymentHistory ?? []),
    drive_link: b.driveLink ?? null,
    // Raw photo / edited delivery columns — only send when used (migration-safe).
    ...(b.rawPhotoLink ||
    b.rawPhotoStatus ||
    b.rawPhotoNotes ||
    b.rawPhotoSubmittedAt ||
    b.rawPhotoApprovedAt
      ? {
          raw_photo_link: b.rawPhotoLink ?? null,
          raw_photo_status: b.rawPhotoStatus ?? null,
          raw_photo_notes: b.rawPhotoNotes ?? null,
          raw_photo_submitted_at: b.rawPhotoSubmittedAt ?? null,
          raw_photo_approved_at: b.rawPhotoApprovedAt ?? null,
        }
      : {}),
    ...(b.editedPhotoLink || b.editedPhotoDeliveredAt
      ? {
          edited_photo_link: b.editedPhotoLink ?? null,
          edited_photo_delivered_at: b.editedPhotoDeliveredAt ?? null,
        }
      : {}),
  }
}

export type DbPackageRow = {
  id: string
  category: string
  title: string
  price_display: string
  price_amount: number
  duration: string | null
  description: string | null
  features: string[] | null
  slot_type: string
  secondary_price_display: string | null
  secondary_price_amount: number | null
  secondary_price_label: string | null
  book_variants: { id: string; label: string }[] | null
  note: string | null
  is_active: boolean
  sort_order: number
}

function parseFeatures(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String)
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed.map(String) : []
    } catch {
      return []
    }
  }
  return []
}

export function mapDbPackageRow(row: DbPackageRow) {
  return {
    id: row.id,
    category: row.category as 'graduation' | 'self-portrait' | 'creative',
    title: row.title,
    price: row.price_display,
    priceAmount: Number(row.price_amount),
    duration: row.duration || 'Studio session',
    description: row.description || row.title,
    features: parseFeatures(row.features),
    slotType: row.slot_type === 'makeup' ? ('makeup' as const) : ('standard' as const),
    secondaryPrice: row.secondary_price_display || undefined,
    secondaryPriceLabel: row.secondary_price_label || undefined,
    bookVariants: row.book_variants || undefined,
    note: row.note || undefined,
    sortOrder: row.sort_order,
  }
}
