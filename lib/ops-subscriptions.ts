import { createHash } from 'node:crypto'
import type { Notification } from '@/lib/data-store'

export const EMAIL_STORAGE_SUB = {
  id: 'email-storage',
  label: 'Monthly storage subscription (email)',
  startedOn: '2026-08-17',
  warnDaysBefore: 7,
  bookingIdPrefix: 'OPS-EMAIL-STORAGE',
} as const

function parseLocalDate(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d, 12, 0, 0, 0)
}
function addMonths(d: Date, months: number): Date { const next = new Date(d); next.setMonth(next.getMonth() + months); return next }
function daysBetween(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate())
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
}
export type SubscriptionPeriod = { cycleKey: string; periodStart: Date; periodEnd: Date; daysLeft: number; shouldNotify: boolean; isOverdue: boolean }
export function getEmailStoragePeriod(now = new Date()): SubscriptionPeriod {
  const start = parseLocalDate(EMAIL_STORAGE_SUB.startedOn)
  let periodStart = new Date(start)
  let periodEnd = addMonths(periodStart, 1)
  while (true) {
    const daysLeft = daysBetween(now, periodEnd)
    if (daysLeft >= -3) {
      return {
        cycleKey: `${periodEnd.getFullYear()}-${String(periodEnd.getMonth() + 1).padStart(2, '0')}`,
        periodStart, periodEnd, daysLeft,
        shouldNotify: daysLeft <= EMAIL_STORAGE_SUB.warnDaysBefore,
        isOverdue: daysLeft < 0,
      }
    }
    periodStart = periodEnd
    periodEnd = addMonths(periodStart, 1)
  }
}
export function emailStorageOpsBookingId(cycleKey: string): string { return `${EMAIL_STORAGE_SUB.bookingIdPrefix}-${cycleKey}` }
export function opsNotificationId(cycleKey: string, kind: 'reminder' | 'paid'): string {
  const hash = createHash('sha256').update(`fico-mana/email-storage/${cycleKey}/${kind}`).digest('hex')
  return `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-8${hash.slice(17,20)}-${hash.slice(20,32)}`
}
export function buildEmailStorageReminderMessage(period: SubscriptionPeriod): string {
  const endLabel = period.periodEnd.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
  if (period.isOverdue || period.daysLeft < 0) return `${EMAIL_STORAGE_SUB.label} period ended on ${endLabel}. Renew the monthly storage plan so client gallery and system emails keep working.`
  if (period.daysLeft === 0) return `${EMAIL_STORAGE_SUB.label} renews today (${endLabel}). Confirm billing so email storage does not lapse.`
  if (period.daysLeft === 1) return `${EMAIL_STORAGE_SUB.label} renews tomorrow (${endLabel}). Confirm billing / payment before it ends.`
  return `${EMAIL_STORAGE_SUB.label} renews in ${period.daysLeft} days (${endLabel}). Availed ${EMAIL_STORAGE_SUB.startedOn} — renew before the period ends.`
}
export function isEmailStorageCyclePaid(notifications: Pick<Notification, 'id' | 'bookingId' | 'type'>[], cycleKey: string): boolean {
  const bookingId = emailStorageOpsBookingId(cycleKey)
  const paidId = opsNotificationId(cycleKey, 'paid')
  return notifications.some((n) => n.type === 'OPS_PAID' && (n.id === paidId || n.bookingId === bookingId))
}
export function buildEmailStoragePaidMessage(period: SubscriptionPeriod): string {
  const endLabel = period.periodEnd.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
  return `${EMAIL_STORAGE_SUB.label} marked paid for period ending ${endLabel}.`
}
export function getActiveEmailStorageReminder(now = new Date(), notifications: Pick<Notification, 'id' | 'bookingId' | 'type'>[] = []): Notification | null {
  const period = getEmailStoragePeriod(now)
  if (!period.shouldNotify || isEmailStorageCyclePaid(notifications, period.cycleKey)) return null
  return {
    id: opsNotificationId(period.cycleKey, 'reminder'),
    // System notifications deliberately have no booking foreign key.
    bookingId: '',
    type: 'OPS_REMINDER',
    message: buildEmailStorageReminderMessage(period),
    isRead: false,
    createdAt: new Date().toISOString(),
  }
}
