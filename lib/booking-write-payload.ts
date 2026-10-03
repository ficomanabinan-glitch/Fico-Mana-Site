import type { Booking } from './data-store'

/** Read responses also contain server-owned Client360/provisioning metadata. */
export const bookingWriteFields = [
  'id', 'customerName', 'customerEmail', 'customerPhone', 'customerFbLink', 'customerFbName',
  'packageId', 'packageName', 'packageSlotType', 'selectionLimit', 'bookingDate', 'bookingTime',
  'slotId', 'arrivalTime', 'shootTime', 'isWalkIn', 'note', 'staffNotes', 'schoolName', 'course',
  'hoodColor', 'togaColor', 'tasselColor', 'backgroundColor', 'depositAmount', 'price',
  'discountAmount', 'discountLabel', 'transactionRef', 'bookingStatus', 'paymentStatus',
  'rejectionReason', 'rejectionReasonId', 'createdAt', 'receiptUrl', 'paymentHistory',
  'rawPhotoStatus', 'rawPhotoNotes', 'rawPhotoSubmittedAt', 'rawPhotoApprovedAt', 'editedPhotoDeliveredAt',
] as const

/** Preserve explicit clears and writable fields without bundling server validation. */
export function toBookingWritePayload(booking: Booking): Pick<Booking, typeof bookingWriteFields[number]> {
  return Object.fromEntries(bookingWriteFields.filter(field => Object.hasOwn(booking, field))
    .map(field => [field, booking[field]])) as Pick<Booking, typeof bookingWriteFields[number]>
}
