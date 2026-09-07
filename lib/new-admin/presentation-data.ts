import type { Booking } from '@/lib/data-store'
import type { EditorBatchSummary } from '@/lib/editor-read-cache'
import type { ManagedPackage } from '@/lib/package-manager-cache'
import type { SalesSummaryPayload } from '@/lib/sales-read-cache'
import { calculateSalesSummary } from '@/lib/sales-finance'

export type DriveOverview = { items: Array<{ bookingId: string; customerName: string; shootDate: string; provisioningStatus: string; driveClientFolderUrl: string | null; portal: { status: string; expiresAt: string | null } | null }>; googleDrive: { rootFolderId: string | null; rootFolderName: string; connected: boolean; needsReconnect: boolean; accountEmail: string | null; portalExpiryDays: number } }
export type ConsoleData = { bookings: Booking[]; batches: EditorBatchSummary[]; sales: SalesSummaryPayload | null; drive: DriveOverview | null; packages: ManagedPackage[] }
export const emptyConsoleData: ConsoleData = { bookings: [], batches: [], sales: null, drive: null, packages: [] }
export function studioDay(now = new Date()) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now) }
export function dateLabel(day: string) { const date = new Date(day.includes('T') ? day : `${day}T12:00:00+08:00`); return Number.isFinite(date.getTime()) ? date.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' }) : day }
export function peso(value: number) { return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(value) }
export function periodKey(day: string, mode: 'day' | 'week' | 'month') {
  if (mode === 'day') return day
  if (mode === 'month') return day.slice(0,7)
  const date = new Date(`${day}T12:00:00Z`)
  if (!Number.isFinite(date.getTime())) return day
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7)
  return date.toISOString().slice(0,10)
}
export function safeDriveUrl(value?: string | null) {
  if (!value) return null
  try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'drive.google.com' && !url.username && !url.password && !url.port ? url.href : null } catch { return null }
}

/** Presentation-only records: no writes, real names, emails, phone numbers or file identifiers. */
export function sampleConsoleData(today = studioDay()): ConsoleData {
  const bookings: Booking[] = Array.from({ length: 8 }, (_, index) => {
    const day = new Date(`${today}T12:00:00Z`); day.setUTCDate(day.getUTCDate() - (index % 5))
    const date = day.toISOString().slice(0,10)
    const paid = index % 3 === 0 ? 'Paid Full' : index % 3 === 1 ? 'Paid Deposit' : 'Unpaid'
    return { id: `SAMPLE-${String(index+1).padStart(3,'0')}`, customerName: `Sample Student ${String(index+1).padStart(3,'0')}`, customerEmail: '', customerPhone: '', customerFbLink: '', customerFbName: '', packageId: 'sample-graduation', packageName: 'Sample Graduation Package', selectionLimit: index % 2 ? 5 : 7, bookingDate: date, bookingTime: '10:00 AM', depositAmount: 500, price: 1800, bookingStatus: index === 0 ? 'Pending Verification' : index === 3 ? 'Completed' : 'Confirmed', paymentStatus: paid, createdAt: `${date}T02:00:00Z`, paymentHistory: paid === 'Unpaid' ? [] : [{ id: `SAMPLE-PAY-${index}`, amount: paid === 'Paid Full' ? 1800 : 500, method: 'GCash', type: 'Deposit', date }], rawPhotoStatus: index % 2 ? 'Approved' : 'Pending Review' }
  })
  const settings = { monthlyRevenueTarget: 50000, desiredMonthlyProfit: 25000, desiredProfitMargin: 40 }
  const sales = { settings, summary: calculateSalesSummary(bookings, [{ id: 'sample-expense', expenseType: 'variable', name: 'Sample studio supplies', category: 'Supplies', amount: 600, expenseDate: today, recurrence: 'one_time', isActive: true }], settings, 'month', new Date(`${today}T12:00:00`)) }
  const days = [...new Set(bookings.map(b => b.bookingDate))]
  const batches = days.map((day, index): EditorBatchSummary => {
    const clients = bookings.filter(b => b.bookingDate === day).map(b => ({ bookingId: b.id, clientId: b.id, clientName: b.customerName, packageName: b.packageName, status: index === 1 ? 'DOWNLOADED' : 'WAITING_FOR_SELECTION', selectedCount: index === 1 ? b.selectionLimit ?? 0 : 0 }))
    return { id: `SAMPLE-BATCH-${day}`, workspaceId: 'sample', shootDate: day, locationKey: 'MAIN', status: index === 1 ? 'DOWNLOADED' : 'WAITING_FOR_SELECTION', totalClients: clients.length, totalSelectedPhotos: clients.reduce((sum,c) => sum+c.selectedCount,0), counts: { waitingForSelection: index === 1 ? 0 : clients.length, readyForEditing: 0, downloaded: index === 1 ? clients.length : 0, editing: 0, readyToUpload: 0, uploading: 0, delivered: 0, failed: 0 }, clients, driveDayFolderUrl: '' }
  })
  return { bookings, batches, sales, drive: { items: bookings.map(b => ({ bookingId: b.id, customerName: b.customerName, shootDate: b.bookingDate, provisioningStatus: 'NOT_STARTED', driveClientFolderUrl: null, portal: null })), googleDrive: { rootFolderId: null, rootFolderName: 'Sample studio folders', connected: false, needsReconnect: false, accountEmail: null, portalExpiryDays: 30 } }, packages: [{ id: 'sample-graduation', category: 'graduation' as ManagedPackage['category'], title: 'Sample Graduation Package', price: '₱1,800', priceAmount: 1800, features: ['Studio session', 'Enhanced photo selections', 'Package-specific print allocation'], slotType: 'standard', selectionLimit: 5, isActive: true, sortOrder: 0 }] }
}
