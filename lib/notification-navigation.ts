import type { Notification } from '@/lib/data-store'

export function notificationDestination(notification: Pick<Notification, 'type' | 'bookingId'>, localEditor = false): string {
  const bookingSearch = notification.bookingId ? `?search=${encodeURIComponent(notification.bookingId)}` : ''
  const editorBase = localEditor ? '' : 'https://editor.ficomana.com'
  switch (notification.type) {
    case 'RAW_PHOTO_UPLOAD':
    case 'RAW_PHOTO_REJECTED':
      return `${editorBase}/editor/filtering${bookingSearch ? `${bookingSearch}&tab=queue` : '?tab=queue'}`
    case 'RAW_PHOTO_APPROVED':
      return `${editorBase}/editor/queue${bookingSearch}`
    case 'EDITED_PHOTOS_READY':
      return `${editorBase}/editor/client-portals${bookingSearch}`
    case 'SHOOT_REMINDER_ERROR':
      return '/admin/shoot-reminders'
    case 'RECEIPT_UPLOAD':
      return `/admin/verification${bookingSearch}`
    case 'NEW_BOOKING':
    case 'CANCELLED':
    case 'RESUBMITTED':
    case 'PAYMENT_REJECTED':
      return `/admin/bookings${bookingSearch}`
    default:
      return '/admin/dashboard'
  }
}
