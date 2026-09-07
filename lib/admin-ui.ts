import type { Booking } from '@/lib/data-store'
import type { RawPhotoWorkflowStatus } from '@/lib/booking-display'

export const adminPage = 'w-full min-w-0 space-y-6 font-sans'
export const adminTitle = 'text-2xl font-bold tracking-tight text-white'
export const adminSubtitle = 'text-sm text-white/50 mt-1.5 max-w-2xl leading-relaxed'
export const adminCard =
  'rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.01] shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]'
export const adminPanel =
  'rounded-xl border border-white/10 bg-[#222222] shadow-[0_8px_32px_rgba(0,0,0,0.35)]'
export const adminInput =
  'w-full rounded-lg bg-white/[0.06] border border-white/20 text-white placeholder:text-white/35 px-3 py-2.5 text-sm focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors'
export const adminSelect =
  'admin-select w-full rounded-lg bg-[#222222] border border-white/10 text-white p-3.5 text-xs font-semibold focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20 [color-scheme:dark] transition-colors'
export const adminLabel = 'text-[10px] font-bold tracking-widest text-[#C4CEFF] uppercase'
export const adminSectionLabel = 'text-[10px] font-bold tracking-widest text-white/55 uppercase'
export const adminBtnPrimary =
  'rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-[#1a14e8] active:scale-[0.99] transition-all disabled:opacity-50 disabled:pointer-events-none'
export const adminBtnGhost =
  'rounded-lg border border-white/10 text-white/70 hover:border-white/25 hover:bg-white/[0.04] hover:text-white text-[10px] font-bold uppercase tracking-wider transition-all active:scale-[0.98]'
export const adminTableWrap = `${adminPanel} overflow-x-auto`
export const adminTableHead =
  'bg-white/[0.03] border-b border-white/10 text-[10px] font-bold tracking-widest text-white/40 uppercase'
export const adminTableRow = 'hover:bg-white/[0.03] transition-colors'
export const adminSpinnerWrap = 'min-h-[400px] w-full py-1'
export const adminSpinner =
  'relative h-[360px] w-full overflow-hidden rounded-xl border border-white/10 bg-white/[0.025] animate-pulse before:absolute before:left-4 before:top-5 before:h-6 before:w-48 before:rounded-md before:bg-white/10 after:absolute after:inset-x-4 after:top-16 after:bottom-4 after:rounded-lg after:bg-[repeating-linear-gradient(to_bottom,rgba(255,255,255,0.07)_0px,rgba(255,255,255,0.07)_38px,transparent_38px,transparent_54px)]'
export const adminOverlay = 'fixed inset-0 bg-black/75 backdrop-blur-md flex z-50 animate-in fade-in duration-200'
export const adminDrawer =
  'bg-[#222222] border-l border-white/10 w-full max-w-lg h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-300'
export const adminModal =
  'rounded-xl bg-[#222222] border border-white/10 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200'

export const adminActionSuccess = 'ring-2 ring-green-500/50 scale-[1.02] transition-all duration-300'
export const adminCardHover =
  'hover:border-white/20 hover:shadow-[0_0_32px_rgba(5,0,208,0.08)] transition-all duration-300'

export const adminEmptyState =
  'flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center'

export const adminNavActive =
  'bg-primary/15 text-white border border-primary/30 shadow-[0_0_20px_rgba(5,0,208,0.12)]'
export const adminNavIdle =
  'text-white/55 hover:bg-white/[0.04] hover:text-white border border-transparent'

const statusPill = 'inline-flex items-center whitespace-nowrap'

export function bookingStatusBadge(status: Booking['bookingStatus']) {
  switch (status) {
    case 'Confirmed':
      return `${statusPill} rounded-md bg-green-500/15 text-green-400 border border-green-500/30`
    case 'Pending Verification':
      return `${statusPill} rounded-md bg-amber-500/15 text-amber-400 border border-amber-500/30`
    case 'Pending Payment':
      return `${statusPill} rounded-md bg-orange-500/15 text-orange-400 border border-orange-500/30`
    case 'Completed':
      return `${statusPill} rounded-md bg-blue-500/15 text-blue-400 border border-blue-500/30`
    case 'Cancelled':
      return `${statusPill} rounded-md bg-red-500/15 text-red-400 border border-red-500/30`
    case 'No Show':
      return `${statusPill} rounded-md bg-white/10 text-white/50 border border-white/20`
    default:
      return `${statusPill} rounded-md bg-white/5 text-white/60 border border-white/10`
  }
}

export function rawPhotoStatusBadge(status: RawPhotoWorkflowStatus) {
  switch (status) {
    case 'approved':
      return `${statusPill} rounded-md bg-green-500/15 text-green-400 border border-green-500/30`
    case 'delivered':
      return `${statusPill} rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30`
    case 'rejected':
      return `${statusPill} rounded-md bg-red-500/15 text-red-400 border border-red-500/30`
    case 'pending_review':
      return `${statusPill} rounded-md bg-amber-500/15 text-amber-400 border border-amber-500/30`
    case 'awaiting_selection':
      return `${statusPill} rounded-md bg-cyan-500/15 text-cyan-400 border border-cyan-500/30`
    case 'awaiting_gallery':
      return `${statusPill} rounded-md bg-white/5 text-white/50 border border-white/10`
  }
}

export function paymentStatusBadge(status: Booking['paymentStatus']) {
  switch (status) {
    case 'Paid Full':
      return `${statusPill} rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/30`
    case 'Paid Deposit':
      return `${statusPill} rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-500/20`
    case 'Pending Verification':
      return `${statusPill} rounded-md bg-amber-500/15 text-amber-400 border border-amber-500/30`
    case 'Unpaid':
      return `${statusPill} rounded-md bg-red-500/15 text-red-400 border border-red-500/30`
    case 'Refunded':
      return `${statusPill} rounded-md bg-orange-500/15 text-orange-400 border border-orange-500/30`
    default:
      return `${statusPill} rounded-md bg-white/5 text-white/60 border border-white/10`
  }
}

export function emailStatusBadge(status: 'SENT' | 'FAILED') {
  return status === 'SENT'
    ? `${statusPill} rounded-md bg-green-500/15 text-green-400 border border-green-500/30`
    : `${statusPill} rounded-md bg-red-500/15 text-red-400 border border-red-500/30`
}

export function notificationTypeBadge(type: string) {
  switch (type) {
    case 'NEW_BOOKING':
      return 'text-[#B8C4FF]'
    case 'RECEIPT_UPLOAD':
    case 'RESUBMITTED':
      return 'text-amber-400'
    case 'PAYMENT_REJECTED':
    case 'SHOOT_REMINDER_ERROR':
    case 'RAW_PHOTO_REJECTED':
      return 'text-red-400'
    case 'RAW_PHOTO_APPROVED':
    case 'EDITED_PHOTOS_READY':
      return 'text-green-400'
    case 'RAW_PHOTO_UPLOAD':
      return 'text-cyan-400'
    case 'CANCELLED':
      return 'text-white/40'
    case 'OPS_REMINDER':
      return 'text-amber-300'
    case 'OPS_PAID':
      return 'text-emerald-400'
    default:
      return 'text-white/60'
  }
}
