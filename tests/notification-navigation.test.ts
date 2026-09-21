import assert from 'node:assert/strict'
import test from 'node:test'
import { notificationDestination } from '../lib/notification-navigation.ts'

test('notifications open the related booking or editor workflow', () => {
  assert.equal(notificationDestination({ type: 'NEW_BOOKING', bookingId: 'FM-123' }), '/admin/bookings?search=FM-123')
  assert.equal(notificationDestination({ type: 'RECEIPT_UPLOAD', bookingId: 'FM-123' }), '/admin/verification?search=FM-123')
  assert.equal(notificationDestination({ type: 'RAW_PHOTO_UPLOAD', bookingId: 'FM-123' }, true), '/editor/filtering?search=FM-123&tab=queue')
  assert.equal(notificationDestination({ type: 'RAW_PHOTO_APPROVED', bookingId: 'FM-123' }), 'https://editor.ficomana.com/editor/queue?search=FM-123')
  assert.equal(notificationDestination({ type: 'SHOOT_REMINDER_ERROR', bookingId: '' }), '/admin/shoot-reminders')
  assert.equal(notificationDestination({ type: 'EDITED_PHOTOS_READY', bookingId: 'FM-123' }), 'https://editor.ficomana.com/editor/client-portals?search=FM-123')
})

test('notification links encode booking references rather than accepting URLs', () => {
  assert.equal(notificationDestination({ type: 'NEW_BOOKING', bookingId: 'FM/123?x=1' }), '/admin/bookings?search=FM%2F123%3Fx%3D1')
})
