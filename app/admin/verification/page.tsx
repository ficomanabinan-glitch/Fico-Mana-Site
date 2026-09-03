'use client'

import { useEffect, useState } from 'react'
import { getBookings, dismissBookingNotifications, addNotification, Booking } from '@/lib/data-store'
import { GraduationSessionDetails } from '@/components/graduation-session-details'
import { runAdminTransaction, formatEmailResult } from '@/lib/admin-actions'
import { useAdminToast } from '@/components/admin-toast-provider'
import AdminPageHeader from '@/components/admin-page-header'
import { useOnAdminDbSync } from '@/components/admin-auto-sync'
import { 
  Check, 
  X, 
  Mail, 
  Download, 
  FileText, 
  ExternalLink,
  RefreshCw,
  AlertCircle,
  Search,
} from 'lucide-react'
import { bookingMatchesSearch, enrichBookingDisplay, isLikelyInvalidReceipt } from '@/lib/booking-display'
import ReceiptPreview from '@/components/receipt-preview'
import { adminPage, adminSpinnerWrap, adminSpinner, adminCardHover, adminSelect, adminInput } from '@/lib/admin-ui'
import {
  REJECTION_REASONS,
  resolveRejectionMessage,
  isForgedRejection,
  type RejectionReasonId,
} from '@/lib/rejection-reasons'

export default function PaymentVerificationQueue() {
  const toast = useAdminToast()
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  
  // Modal states
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null)
  const [showReceiptModal, setShowReceiptModal] = useState(false)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectionReason, setRejectionReason] = useState<RejectionReasonId>('forged')
  const [customReason, setCustomReason] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [exiting, setExiting] = useState<{ id: string; type: 'approve' | 'reject' } | null>(null)

  /** Play the card exit animation before removing it from the queue. */
  const animateCardExit = async (bookingId: string, type: 'approve' | 'reject') => {
    setExiting({ id: bookingId, type })
    await new Promise((resolve) => window.setTimeout(resolve, 700))
    setBookings((prev) => prev.filter((b) => b.id !== bookingId))
    setExiting(null)
  }

  const fetchQueue = async (silent = false) => {
    if (!silent) setRefreshing(true)
    try {
      const data = await getBookings()
      const queue = data
        .filter((b) => b.bookingStatus === 'Pending Verification')
        .map(enrichBookingDisplay)
      setBookings(queue)
    } catch (err) {
      console.error(err)
      toast.error('Sync failed', 'Could not load bookings from database.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchQueue(true)
  }, [])

  useOnAdminDbSync(() => fetchQueue(true))

  const handleApprove = async (booking: Booking) => {
    if (!window.confirm(`Approve payment for ${booking.id}?`)) return

    setActionLoading(true)
    try {
      const history = [...(booking.paymentHistory || [])]
      const existingDeposit = history.find((p) => p.type === 'Deposit')
      if (!existingDeposit) {
        history.push({
          id: 'PAY-' + Math.floor(1000 + Math.random() * 9000),
          amount: booking.depositAmount,
          method: 'BPI',
          type: 'Deposit',
          transactionRef: booking.transactionRef,
          date: new Date().toISOString(),
        })
      }

      const updatedBooking: Booking = {
        ...booking,
        bookingStatus: 'Confirmed',
        paymentStatus: 'Paid Deposit',
        paymentHistory: history,
      }

      const { emailErrors } = await runAdminTransaction(updatedBooking)

      setShowReceiptModal(false)
      setSelectedBooking(null)
      await animateCardExit(booking.id, 'approve')

      try {
        await dismissBookingNotifications(booking.id)
      } catch (err) {
        console.warn('dismissBookingNotifications failed:', err)
      }

      const emailMsg = formatEmailResult(emailErrors)
      if (emailMsg) {
        toast.warning(`${booking.id} confirmed in database`, emailMsg)
      } else {
        toast.success('Payment approved', `${booking.id} confirmed — 1 email sent to customer.`)
      }

      fetchQueue(true)
    } catch (err) {
      console.error(err)
      toast.error('Approval failed', err instanceof Error ? err.message : 'Could not save to database.')
    } finally {
      setActionLoading(false)
    }
  }

  const submitRejection = async (booking: Booking, reasonId: RejectionReasonId, custom?: string) => {
    const finalReason = resolveRejectionMessage(reasonId, custom)
    const forged = isForgedRejection(reasonId, finalReason)

    const updatedBooking: Booking = {
      ...booking,
      bookingStatus: 'Pending Payment',
      paymentStatus: 'Unpaid',
      rejectionReason: finalReason,
      rejectionReasonId: reasonId,
      receiptUrl: forged ? '' : booking.receiptUrl,
      transactionRef: forged ? '' : booking.transactionRef,
      paymentHistory: forged ? [] : booking.paymentHistory,
    }

    const { emailErrors } = await runAdminTransaction(updatedBooking)

    setShowRejectModal(false)
    setShowReceiptModal(false)
    setSelectedBooking(null)
    setCustomReason('')
    setRejectionReason('forged')
    await animateCardExit(booking.id, 'reject')

    try {
      await dismissBookingNotifications(booking.id)
    } catch (err) {
      console.warn('dismissBookingNotifications failed:', err)
    }

    try {
      await addNotification(
        booking.id,
        'PAYMENT_REJECTED',
        forged
          ? `Forged/fake receipt rejected for ${booking.id}. Customer must upload genuine GCash/BPI proof.`
          : `Payment receipt for Booking ${booking.id} was rejected. Reason: ${finalReason}`,
      )
    } catch (err) {
      console.warn('addNotification failed:', err)
    }

    await fetchQueue(true)

    const emailMsg = formatEmailResult(emailErrors)
    if (emailMsg) {
      toast.warning(`${booking.id} set to Pending Payment`, emailMsg)
    } else {
      toast.success(
        forged ? 'Forged receipt rejected' : 'Receipt rejected',
        forged
          ? 'Customer emailed — must upload a genuine GCash/BPI screenshot.'
          : 'Customer notified to resubmit via email.',
      )
    }
  }

  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedBooking) return

    if (rejectionReason === 'other' && !customReason.trim()) {
      toast.warning('Reason required', 'Enter a rejection reason for the customer.')
      return
    }

    setActionLoading(true)
    try {
      await submitRejection(selectedBooking, rejectionReason, customReason)
    } catch (err) {
      console.error(err)
      toast.error('Rejection failed', err instanceof Error ? err.message : 'Could not update database.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleRejectForged = async (booking: Booking) => {
    if (
      !window.confirm(
        `Reject ${booking.id} as a forged/fake receipt? The customer will be emailed and must upload a genuine GCash/BPI screenshot.`,
      )
    ) {
      return
    }

    setActionLoading(true)
    try {
      await submitRejection(booking, 'forged')
    } catch (err) {
      console.error(err)
      toast.error('Rejection failed', err instanceof Error ? err.message : 'Could not update database.')
    } finally {
      setActionLoading(false)
    }
  }

  const receiptModalBooking =
    showReceiptModal && selectedBooking ? enrichBookingDisplay(selectedBooking) : null

  const visibleBookings = searchTerm.trim()
    ? bookings.filter((booking) => bookingMatchesSearch(booking, searchTerm))
    : bookings

  if (loading) {
    return (
      <div className={adminSpinnerWrap}>
        <div className={adminSpinner} />
      </div>
    )
  }

  return (
    <div className={adminPage}>
      <AdminPageHeader
        title="Payment Verification"
        subtitle="Review uploaded GCash screenshots and approve or reject sessions."
        onRefresh={() => fetchQueue()}
        refreshing={refreshing}
      />

      {bookings.length === 0 ? (
        <div className="border border-white/10 bg-[#222222] p-16 text-center shadow-sm">
          <div className="w-16 h-16 bg-green-500/10 border border-green-500/30 flex items-center justify-center text-green-400 rounded-full mx-auto mb-4">
            <Check className="w-8 h-8" />
          </div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-white">Verification Queue Empty</h3>
          <p className="text-xs text-white/40 mt-1">All booking deposits have been verified. Excellent job!</p>
        </div>
      ) : (
        <>
          <div className="border border-white/10 bg-[#222222] p-4 mb-5">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search FM-123456, receipt no., GCash ref, name, phone..."
                className={`${adminInput} pl-11`}
              />
            </div>
            <p className="text-[11px] text-white/45 mt-3">
              Showing <span className="font-semibold text-white/70">{visibleBookings.length}</span> of{' '}
              <span className="font-semibold text-white/70">{bookings.length}</span> in queue
            </p>
          </div>

          {visibleBookings.length === 0 ? (
            <div className="border border-white/10 bg-[#222222] p-12 text-center">
              <p className="text-sm text-white/50">No bookings match your search.</p>
            </div>
          ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {visibleBookings.map((booking) => {
            const display = enrichBookingDisplay(booking)
            return (
            <div key={booking.id} className={`border border-white/10 bg-white/[0.02] flex flex-col justify-between overflow-hidden ${adminCardHover} ${exiting?.id === booking.id ? (exiting.type === 'approve' ? 'card-approve-exit' : 'card-reject-exit') : ''} ${isLikelyInvalidReceipt(display.receiptUrl) ? 'ring-1 ring-red-500/40' : ''}`}>
              {/* Receipt Preview Thumbnail */}
              <div 
                className="h-48 bg-white/[0.05] relative overflow-hidden group cursor-pointer border-b border-white/10"
                onClick={() => {
                  setSelectedBooking(display)
                  setShowReceiptModal(true)
                }}
              >
                <ReceiptPreview receiptUrl={display.receiptUrl} fill className="h-48" />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-semibold uppercase tracking-widest pointer-events-none">
                  View Large Receipt
                </div>
              </div>

              {/* Card Details */}
              <div className="p-5 space-y-4">
                <div className="flex justify-between items-start border-b border-white/10 pb-3">
                  <div>
                    <h3 className="font-semibold text-white">{booking.customerName}</h3>
                    <p className="text-[10px] text-white/40 font-mono mt-0.5">{booking.id}</p>
                  </div>
                  <span className="text-[9px] bg-primary/10 text-primary font-bold px-2 py-0.5 rounded-full uppercase">
                    {booking.packageName}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-y-2 text-xs">
                  <div>
                    <p className="text-white/40 font-medium text-[9px] uppercase tracking-wider">Date & Time</p>
                    <p className="font-semibold text-white/90">{booking.bookingDate}</p>
                    <p className="text-white/50 text-[10px] mt-0.5">{booking.bookingTime}</p>
                  </div>
                  <div>
                    <p className="text-white/40 font-medium text-[9px] uppercase tracking-wider">GCash Transaction Ref</p>
                    <p className="font-mono font-bold text-white/90">{display.transactionRef || 'Not provided'}</p>
                  </div>
                  <div className="col-span-2 border-t border-white/10 pt-3">
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-white/40 font-medium">Deposit Amount:</span>
                      <span className="font-bold text-[#8FA0FF]">₱{booking.depositAmount.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="bg-white/[0.03] px-5 py-3 border-t border-white/10 space-y-2">
                {isLikelyInvalidReceipt(display.receiptUrl) && (
                  <button
                    type="button"
                    onClick={() => handleRejectForged(display)}
                    disabled={actionLoading}
                    className="btn-reject-fx w-full bg-red-950 hover:bg-red-900 border border-red-500/50 text-red-200 text-[10px] font-bold uppercase tracking-wider py-2 flex items-center justify-center gap-1 disabled:opacity-50"
                  >
                    <AlertCircle className="w-3.5 h-3.5" /> Reject — Forged / Not a receipt
                  </button>
                )}
                <div className="flex gap-2">
                <button
                  onClick={() => handleApprove(display)}
                  disabled={actionLoading}
                  className="btn-approve-fx flex-1 bg-green-600 hover:bg-green-700 text-white text-[10px] font-bold uppercase tracking-wider py-2 flex items-center justify-center gap-1"
                >
                  <Check className="w-3.5 h-3.5" /> Approve
                </button>
                <button
                  onClick={() => {
                    setSelectedBooking(display)
                    setRejectionReason(isLikelyInvalidReceipt(display.receiptUrl) ? 'forged' : 'unable_to_verify')
                    setShowRejectModal(true)
                  }}
                  disabled={actionLoading}
                  className="btn-reject-fx flex-1 bg-red-600 hover:bg-red-700 text-white text-[10px] font-bold uppercase tracking-wider py-2 flex items-center justify-center gap-1"
                >
                  <X className="w-3.5 h-3.5" /> Reject
                </button>
                </div>
              </div>
            </div>
            )
          })}
        </div>
          )}
        </>
      )}

      {/* 1. RECEIPT VIEWER MODAL */}
      {receiptModalBooking && selectedBooking && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="border border-white/10 bg-[#222222] shadow-2xl max-w-4xl w-full flex flex-col md:flex-row overflow-hidden max-h-[90vh]">
            <div className="md:w-1/2 bg-white/[0.05] border-r border-white/10 relative min-h-[300px] flex items-center justify-center">
              {receiptModalBooking.receiptUrl && receiptModalBooking.receiptUrl.endsWith('.pdf') ? (
                <div className="p-12 text-center text-white/50 space-y-4">
                  <FileText className="w-20 h-20 text-primary/50 mx-auto" />
                  <p className="text-sm font-semibold uppercase tracking-wider">PDF Receipt Attachment</p>
                  <a 
                    href={receiptModalBooking.receiptUrl} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="inline-flex items-center gap-1.5 text-xs text-primary font-bold hover:underline"
                  >
                    Open PDF in new tab <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              ) : (
                <ReceiptPreview receiptUrl={receiptModalBooking.receiptUrl} fill className="min-h-[300px]" />
              )}
            </div>

            {/* Receipt Details Panel */}
            <div className="md:w-1/2 p-8 flex flex-col justify-between overflow-y-auto space-y-6">
              <div className="space-y-6">
                <div className="flex justify-between items-start border-b border-white/10 pb-4">
                  <div>
                    <span className="text-[9px] text-white/40 font-bold uppercase tracking-widest">Verification Details</span>
                    <h2 className="text-lg font-bold text-white mt-1">{selectedBooking.customerName}</h2>
                    <p className="text-xs font-mono text-white/40 mt-0.5">Reference: {selectedBooking.id}</p>
                  </div>
                  <button 
                    onClick={() => {
                      setShowReceiptModal(false)
                      setSelectedBooking(null)
                    }}
                    className="p-1.5 hover:bg-white/[0.05] rounded text-white/40"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4 text-xs">
                  <div className="min-w-0">
                    <p className="text-white/40 font-medium text-[8px] uppercase tracking-wider">Email</p>
                    <p className="font-semibold text-white/90 break-all">{selectedBooking.customerEmail}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-white/40 font-medium text-[8px] uppercase tracking-wider">Phone</p>
                    <p className="font-semibold text-white/90 break-words">{selectedBooking.customerPhone}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-white/40 font-medium text-[8px] uppercase tracking-wider">Facebook Name</p>
                    <p className="font-semibold text-white/90 break-words">{selectedBooking.customerFbName || 'N/A'}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-white/40 font-medium text-[8px] uppercase tracking-wider">Facebook Link</p>
                    {selectedBooking.customerFbLink ? (
                      <a 
                        href={selectedBooking.customerFbLink} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="text-[#C4CEFF] hover:underline hover:text-white font-semibold inline-flex items-center gap-1 mt-0.5 break-all"
                      >
                        Visit Profile <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                      </a>
                    ) : (
                      <p className="text-white/50 italic mt-0.5">No link provided</p>
                    )}
                  </div>
                  <div>
                    <p className="text-white/40 font-medium text-[8px] uppercase tracking-wider">Package / Session</p>
                    <p className="font-semibold text-[#C4CEFF]">{selectedBooking.packageName}</p>
                  </div>
                  <div>
                    <p className="text-white/40 font-medium text-[8px] uppercase tracking-wider">Date & Time</p>
                    <p className="font-semibold text-white/90">{selectedBooking.bookingDate} at {selectedBooking.bookingTime}</p>
                  </div>
                  <div>
                    <p className="text-white/40 font-medium text-[8px] uppercase tracking-wider">GCash Transaction Ref</p>
                    <p className="font-mono font-bold text-white/90 bg-black/40 border border-white/10 px-2 py-0.5 inline-block">{receiptModalBooking.transactionRef || 'Not provided'}</p>
                  </div>
                  <div>
                    <p className="text-white/40 font-medium text-[8px] uppercase tracking-wider">Total Package Price</p>
                    <p className="font-bold text-white/90">₱{selectedBooking.price.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-white/40 font-medium text-[8px] uppercase tracking-wider">Required Deposit</p>
                    <p className="font-bold text-green-400">₱{selectedBooking.depositAmount.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-white/40 font-medium text-[8px] uppercase tracking-wider">Remaining Balance</p>
                    <p className="font-bold text-red-500">₱{(selectedBooking.price - selectedBooking.depositAmount).toFixed(2)}</p>
                  </div>
                  <GraduationSessionDetails booking={selectedBooking} />
                  {selectedBooking.note && (
                    <div className="col-span-2 border-t border-white/10 pt-3">
                      <p className="text-white/40 font-medium text-[8px] uppercase tracking-wider mb-1">Pre-shoot Request Note</p>
                      <p className="bg-white/[0.03] p-3 border border-white/10 rounded text-white/70 leading-relaxed italic">
                        "{selectedBooking.note}"
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-3 pt-6 border-t border-white/10">
                {isLikelyInvalidReceipt(receiptModalBooking.receiptUrl) && (
                  <div className="bg-red-500/10 border border-red-500/40 p-3 text-xs text-red-200 flex gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <p>This file does not look like a GCash/BPI screenshot. Use <strong>Reject — Forged</strong> if it is not genuine payment proof.</p>
                  </div>
                )}
                {isLikelyInvalidReceipt(receiptModalBooking.receiptUrl) && (
                  <button
                    type="button"
                    onClick={() => handleRejectForged(selectedBooking)}
                    disabled={actionLoading}
                    className="btn-reject-fx w-full bg-red-950 hover:bg-red-900 border border-red-500/50 text-red-200 text-xs font-bold uppercase tracking-wider py-3 flex items-center justify-center gap-1"
                  >
                    <AlertCircle className="w-4 h-4" /> Reject — Forged / Fake Receipt
                  </button>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleApprove(selectedBooking)}
                    disabled={actionLoading}
                    className="btn-approve-fx flex-1 bg-green-600 hover:bg-green-700 text-white text-xs font-bold uppercase tracking-wider py-3 flex items-center justify-center gap-1"
                  >
                    <Check className="w-4 h-4" /> Approve Payment
                  </button>
                  <button
                    onClick={() => {
                      setRejectionReason(
                        isLikelyInvalidReceipt(receiptModalBooking.receiptUrl) ? 'forged' : 'unable_to_verify',
                      )
                      setShowRejectModal(true)
                    }}
                    disabled={actionLoading}
                    className="btn-reject-fx flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase tracking-wider py-3 flex items-center justify-center gap-1"
                  >
                    <X className="w-4 h-4" /> Reject Receipt
                  </button>
                </div>

                <div className="flex justify-between items-center text-xs">
                  {receiptModalBooking.receiptUrl && (
                    <a
                      href={receiptModalBooking.receiptUrl}
                      download={`receipt-${selectedBooking.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-white/50 hover:text-white flex items-center gap-1 hover:underline"
                    >
                      <Download className="w-4 h-4" /> Download Receipt
                    </a>
                  )}
                  <a
                    href={`mailto:${selectedBooking.customerEmail}?subject=FICO MANA Booking: ${selectedBooking.id}`}
                    className="text-white/50 hover:text-white flex items-center gap-1 hover:underline"
                  >
                    <Mail className="w-4 h-4" /> Contact Customer
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. REJECT PAYMENT MODAL */}
      {showRejectModal && selectedBooking && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-[60] animate-in fade-in duration-200">
          <form
            onSubmit={handleRejectSubmit}
            className="relative border border-white/10 bg-[#222222] shadow-2xl max-w-md w-full p-6 md:p-8 space-y-5"
          >
            <div className="flex justify-between items-start border-b border-white/10 pb-3">
              <div>
                <h3 className="font-bold text-white">Reject Payment Receipt</h3>
                <p className="text-[10px] text-white/40 font-mono mt-0.5">Booking ID: {selectedBooking.id}</p>
              </div>
              <button 
                type="button"
                onClick={() => setShowRejectModal(false)}
                className="p-1 hover:bg-white/[0.05] rounded text-white/40"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-200 flex gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  Rejecting this payment will email the client with the specified reason and instructions to re-upload. The booking status will return to <strong>Pending Payment</strong>.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
                  Rejection Reason
                </label>
                <select
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value as RejectionReasonId)}
                  className={adminSelect}
                >
                  {REJECTION_REASONS.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
                {rejectionReason !== 'other' && (
                  <p className="text-[10px] text-white/40 leading-relaxed mt-2">
                    Customer will see: &ldquo;{resolveRejectionMessage(rejectionReason)}&rdquo;
                  </p>
                )}
              </div>

              {rejectionReason === 'other' && (
                <div className="space-y-2">
                  <label htmlFor="customReason" className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
                    Custom Reason Details
                  </label>
                  <textarea
                    id="customReason"
                    required
                    rows={3}
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    placeholder="Enter specific reason details so the customer understands what was wrong with their upload..."
                    className="w-full bg-black/40 border border-white/10 focus:border-primary focus:outline-none p-3 text-xs font-semibold resize-none"
                  />
                </div>
              )}
            </div>

            <div className="flex gap-3 border-t border-white/10 pt-4 mt-2">
              <button
                type="button"
                onClick={() => setShowRejectModal(false)}
                className="flex-1 border border-white/10 text-white/90 text-xs font-bold uppercase tracking-wider py-3 hover:bg-white/[0.03]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={actionLoading}
                className="btn-reject-fx flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase tracking-wider py-3 flex items-center justify-center gap-1"
              >
                {actionLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Rejecting...
                  </>
                ) : (
                  'Confirm Rejection'
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
