'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getBookings, dismissBookingNotifications, Booking } from '@/lib/data-store'
import { useAdminToast } from '@/components/admin-toast-provider'
import AdminPageHeader from '@/components/admin-page-header'
import { useOnAdminDbSync } from '@/components/admin-auto-sync'
import {
  Check,
  X,
  ExternalLink,
  AlertCircle,
  Search,
  Image as ImageIcon,
  Clock,
  ChevronRight,
  List,
} from 'lucide-react'
import {
  adminCardHover,
  adminSelect,
  adminInput,
  adminSpinner,
  adminSpinnerWrap,
} from '@/lib/admin-ui'
import {
  hasRawPhotoSubmission,
  rawPhotoStatusBadgeClass,
} from '@/lib/raw-photo-display'

type FilteringTab = 'Pending Review' | 'Approved' | 'Rejected' | 'All'

type RawRejectionReason = 'blurry' | 'already_edited' | 'invalid_link' | 'unmatching_booking' | 'other'

const RAW_REJECTION_MESSAGES: Record<RawRejectionReason, string> = {
  blurry: 'One or more of your selected photos are blurry or out of focus. Please replace them with clear, sharp photos.',
  already_edited:
    'One or more of your selected photos appear to have been edited, cropped, or filtered. We require the original raw photo files for professional editing.',
  invalid_link:
    'The Google Drive folder link provided is invalid, restricted, or empty. Please ensure the folder is shared with "Anyone with the link" and contains your 5 chosen photos.',
  unmatching_booking:
    'The photos in the folder do not seem to match your booking details. Please verify your selection.',
  other: 'Other (details provided below)',
}

export default function AdminRawPhotoQueue({
  initialSearch = '',
  embedded = false,
}: {
  initialSearch?: string
  /** When true, hide the page header (used inside Filtering Dashboard tabs). */
  embedded?: boolean
}) {
  const toast = useAdminToast()
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searchTerm, setSearchTerm] = useState(initialSearch)
  const [activeTab, setActiveTab] = useState<FilteringTab>(initialSearch ? 'All' : 'Pending Review')
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectionReason, setRejectionReason] = useState<RawRejectionReason>('blurry')
  const [customReason, setCustomReason] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [exiting, setExiting] = useState<{ id: string; type: 'approve' | 'reject' } | null>(null)

  /** Play the card exit animation before the queue refreshes (skipped on the All tab where cards stay visible). */
  const animateCardExit = async (bookingId: string, type: 'approve' | 'reject') => {
    if (activeTab === 'All') return
    setExiting({ id: bookingId, type })
    await new Promise((resolve) => window.setTimeout(resolve, 700))
    setBookings((prev) => prev.filter((b) => b.id !== bookingId))
    setExiting(null)
  }

  const fetchQueue = async (silent = false) => {
    if (!silent) setRefreshing(true)
    try {
      const data = await getBookings()
      setBookings(data.filter(hasRawPhotoSubmission))
    } catch (err) {
      console.error(err)
      toast.error('Sync failed', 'Could not load raw photo queue from database.')
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
    if (!window.confirm(`Approve raw photo selection for ${booking.id}?`)) return

    setActionLoading(true)
    try {
      const res = await fetch(`/api/bookings/${booking.id}/review-raw-photo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'Approve', notes: 'Approved for editing' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to approve raw photo.')

      setShowDetailModal(false)
      setSelectedBooking(null)
      await animateCardExit(booking.id, 'approve')

      toast.success('Selection approved', `${booking.id} is approved for editing.`)
      if (Array.isArray(data.emailErrors) && data.emailErrors.length > 0) {
        toast.warning('Approved — email issue', data.emailErrors.join(' · '))
      }
      try {
        await dismissBookingNotifications(booking.id)
      } catch (err) {
        console.warn('dismissBookingNotifications failed:', err)
      }
      fetchQueue(true)
    } catch (err) {
      console.error(err)
      toast.error('Approval failed', err instanceof Error ? err.message : 'Could not update database.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedBooking) return

    const reasonText = RAW_REJECTION_MESSAGES[rejectionReason]
    const finalReason = rejectionReason === 'other' ? customReason.trim() : reasonText
    const notesText =
      rejectionReason === 'other' ? customReason.trim() : `${reasonText} ${customReason.trim()}`.trim()

    if (rejectionReason === 'other' && !customReason.trim()) {
      toast.warning('Reason required', 'Enter a rejection reason for the customer.')
      return
    }

    setActionLoading(true)
    try {
      const res = await fetch(`/api/bookings/${selectedBooking.id}/review-raw-photo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'Reject', reason: finalReason, notes: notesText }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to reject raw photo.')

      const rejectedId = selectedBooking.id
      setShowRejectModal(false)
      setShowDetailModal(false)
      setSelectedBooking(null)
      setCustomReason('')
      setRejectionReason('blurry')
      await animateCardExit(rejectedId, 'reject')

      if (Array.isArray(data.emailErrors) && data.emailErrors.length > 0) {
        toast.warning('Rejected — email issue', data.emailErrors.join(' · '))
      } else {
        toast.success('Selection rejected', `${rejectedId} was rejected. Client notified.`)
      }
      try {
        await dismissBookingNotifications(rejectedId)
      } catch (err) {
        console.warn('dismissBookingNotifications failed:', err)
      }
      fetchQueue(true)
    } catch (err) {
      console.error(err)
      toast.error('Rejection failed', err instanceof Error ? err.message : 'Could not update database.')
    } finally {
      setActionLoading(false)
    }
  }

  const filteredBookings = bookings.filter((booking) => {
    const matchesSearch =
      booking.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      booking.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      booking.customerEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (booking.packageName && booking.packageName.toLowerCase().includes(searchTerm.toLowerCase()))

    if (!matchesSearch) return false

    const status = booking.rawPhotoStatus || 'Pending Review'
    if (activeTab === 'Pending Review') return status === 'Pending Review'
    if (activeTab === 'Approved') return status === 'Approved'
    if (activeTab === 'Rejected') return status === 'Rejected'
    return true
  })

  const countPending = bookings.filter((b) => (b.rawPhotoStatus || 'Pending Review') === 'Pending Review').length
  const countApproved = bookings.filter((b) => b.rawPhotoStatus === 'Approved').length
  const countRejected = bookings.filter((b) => b.rawPhotoStatus === 'Rejected').length
  const countAll = bookings.length

  return (
    <div className="space-y-6">
      {!embedded && (
        <AdminPageHeader
          title="Raw Photo Filtering"
          subtitle="Review client photo selections — each client submits a Drive folder with their 5 chosen raw photos. Approve for editing or reject with feedback."
          onRefresh={() => fetchQueue()}
          refreshing={refreshing}
        >
          <Link
            href="/admin/bookings"
            className="inline-flex items-center gap-1.5 border border-white/10 bg-white/5 hover:bg-white/10 px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider transition-colors"
          >
            <List className="w-3.5 h-3.5" /> All Bookings
          </Link>
        </AdminPageHeader>
      )}

      {embedded && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-white/50">
            Review client 5-pick folders — approve for editing or reject with feedback.
          </p>
          <button
            type="button"
            onClick={() => fetchQueue()}
            disabled={refreshing}
            className="text-[10px] font-bold uppercase tracking-wider text-primary hover:underline disabled:opacity-50"
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      )}

      <div className="flex border-b border-white/10 gap-2 overflow-x-auto">
        {(['Pending Review', 'Approved', 'Rejected', 'All'] as FilteringTab[]).map((tab) => {
          const count =
            tab === 'Pending Review'
              ? countPending
              : tab === 'Approved'
                ? countApproved
                : tab === 'Rejected'
                  ? countRejected
                  : countAll
          const isActive = activeTab === tab

          return (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3.5 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all whitespace-nowrap ${
                isActive
                  ? 'border-primary text-white bg-white/[0.02]'
                  : 'border-transparent text-white/50 hover:text-white hover:bg-white/[0.01]'
              }`}
            >
              <span className="flex items-center gap-2">
                {tab}
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                    isActive
                      ? 'bg-primary text-white'
                      : tab === 'Pending Review' && count > 0
                        ? 'bg-amber-500/25 text-amber-400 border border-amber-500/30'
                        : 'bg-white/10 text-white/60'
                  }`}
                >
                  {count}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      <div className="border border-white/10 bg-white/[0.01] p-4">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by client name, email, booking reference, package..."
            className={`${adminInput} pl-11`}
          />
        </div>
        <p className="text-[11px] text-white/45 mt-3">
          Showing <span className="font-semibold text-white/70">{filteredBookings.length}</span> of{' '}
          <span className="font-semibold text-white/70">{countAll}</span> raw photo submissions
        </p>
      </div>

      {loading && bookings.length === 0 ? (
        <div className={adminSpinnerWrap}>
          <div className={adminSpinner} />
        </div>
      ) : filteredBookings.length === 0 ? (
        <div className="border border-white/10 bg-white/[0.01] p-16 text-center shadow-sm">
          <div className="w-16 h-16 bg-white/[0.03] border border-white/10 flex items-center justify-center text-white/40 rounded-full mx-auto mb-4">
            <ImageIcon className="w-7 h-7" />
          </div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-white">No submissions found</h3>
          <p className="text-xs text-white/40 mt-1 max-w-md mx-auto">
            Clients submit a Drive folder with their 5 chosen photos after the gallery link email is sent.
          </p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredBookings.map((booking) => {
            const status = booking.rawPhotoStatus || 'Pending Review'
            return (
              <div
                key={booking.id}
                className={`border border-white/10 bg-white/[0.02] flex flex-col justify-between overflow-hidden ${adminCardHover} ${exiting?.id === booking.id ? (exiting.type === 'approve' ? 'card-approve-exit' : 'card-reject-exit') : ''}`}
              >
                <div className="p-5 space-y-4 flex-1">
                  <div className="flex justify-between items-start border-b border-white/10 pb-3 gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-white truncate">{booking.customerName}</h3>
                      <Link
                        href={`/admin/bookings?search=${encodeURIComponent(booking.id)}`}
                        className="text-[10px] text-primary font-mono mt-0.5 hover:underline"
                      >
                        {booking.id}
                      </Link>
                    </div>
                    <span className="text-[9px] bg-primary/10 text-primary border border-primary/20 font-bold px-2 py-0.5 rounded uppercase max-w-[110px] truncate shrink-0">
                      {booking.packageName}
                    </span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between gap-2">
                      <span className="text-white/40">Shoot Date:</span>
                      <span className="font-semibold text-white/80 text-right">{booking.bookingDate}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-white/40">Time Slot:</span>
                      <span className="font-semibold text-white/80 text-right">{booking.bookingTime}</span>
                    </div>
                    {booking.rawPhotoSubmittedAt && (
                      <div className="flex justify-between items-center text-[11px] pt-1 text-white/50 gap-2">
                        <span className="flex items-center gap-1 shrink-0">
                          <Clock className="w-3 h-3" /> Submitted:
                        </span>
                        <span className="text-right">
                          {new Date(booking.rawPhotoSubmittedAt).toLocaleDateString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    )}
                  </div>

                  <span
                    className={`inline-flex items-center gap-2 px-2 py-1 text-[9px] font-bold uppercase tracking-wider border rounded ${rawPhotoStatusBadgeClass(status)}`}
                  >
                    <span className="w-2 h-2 rounded-full bg-current shrink-0" />
                    {status}
                  </span>

                  {status === 'Rejected' && booking.rawPhotoNotes && (
                    <div className="text-[11px] p-2 bg-red-950/20 border border-red-500/10 text-red-200 italic">
                      &ldquo;{booking.rawPhotoNotes}&rdquo;
                    </div>
                  )}
                </div>

                <div className="bg-white/[0.03] px-5 py-4 border-t border-white/10 space-y-3">
                  <a
                    href={booking.rawPhotoLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full bg-[#0500D0]/10 hover:bg-[#0500D0]/20 border border-[#0500D0]/30 text-white text-xs font-semibold py-2.5 flex items-center justify-center gap-1.5 transition-colors uppercase tracking-wider"
                  >
                    Open Photo Folder (5 Picks) <ExternalLink className="w-3.5 h-3.5" />
                  </a>

                  {status === 'Pending Review' && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleApprove(booking)}
                        disabled={actionLoading}
                        className="btn-approve-fx flex-1 bg-green-600 hover:bg-green-700 text-white text-[10px] font-bold uppercase tracking-wider py-2 flex items-center justify-center gap-1"
                      >
                        <Check className="w-3.5 h-3.5" /> Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedBooking(booking)
                          setRejectionReason('blurry')
                          setShowRejectModal(true)
                        }}
                        disabled={actionLoading}
                        className="btn-reject-fx flex-1 bg-red-600 hover:bg-red-700 text-white text-[10px] font-bold uppercase tracking-wider py-2 flex items-center justify-center gap-1"
                      >
                        <X className="w-3.5 h-3.5" /> Reject
                      </button>
                    </div>
                  )}

                  {(status === 'Approved' || status === 'Rejected') && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedBooking(booking)
                        setShowDetailModal(true)
                      }}
                      className="w-full text-center text-white/50 hover:text-white text-[10px] uppercase tracking-wider py-1 font-semibold flex items-center justify-center gap-1 hover:underline"
                    >
                      View Full Details <ChevronRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showDetailModal && selectedBooking && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="border border-white/10 bg-[#222222] shadow-2xl max-w-md w-full p-6 md:p-8 space-y-6">
            <div className="flex justify-between items-start border-b border-white/10 pb-3">
              <div>
                <h3 className="font-bold text-white text-lg">Raw Photo Details</h3>
                <p className="text-[10px] text-white/40 font-mono mt-0.5">{selectedBooking.id}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowDetailModal(false)
                  setSelectedBooking(null)
                }}
                className="p-1 hover:bg-white/[0.05] rounded text-white/40"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-white/40 font-medium">Customer</p>
                  <p className="font-semibold text-white mt-0.5">{selectedBooking.customerName}</p>
                </div>
                <div>
                  <p className="text-white/40 font-medium">Package</p>
                  <p className="font-semibold text-primary mt-0.5">{selectedBooking.packageName}</p>
                </div>
              </div>
              <div>
                <p className="text-white/40 font-medium mb-1.5">Submitted Link</p>
                <a
                  href={selectedBooking.rawPhotoLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 font-mono text-primary hover:underline break-all"
                >
                  {selectedBooking.rawPhotoLink} <ExternalLink className="w-3 h-3 shrink-0" />
                </a>
              </div>
            </div>

            <div className="flex gap-3 border-t border-white/10 pt-4">
              {selectedBooking.rawPhotoStatus === 'Rejected' && (
                <button
                  type="button"
                  onClick={() => handleApprove(selectedBooking)}
                  disabled={actionLoading}
                  className="btn-approve-fx flex-1 bg-green-600 hover:bg-green-700 text-white text-xs font-bold uppercase tracking-wider py-3"
                >
                  Approve Instead
                </button>
              )}
              {selectedBooking.rawPhotoStatus === 'Approved' && (
                <button
                  type="button"
                  onClick={() => {
                    setRejectionReason('blurry')
                    setShowRejectModal(true)
                  }}
                  disabled={actionLoading}
                  className="btn-reject-fx flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase tracking-wider py-3"
                >
                  Reject Instead
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setShowDetailModal(false)
                  setSelectedBooking(null)
                }}
                className="flex-1 border border-white/10 text-white/90 text-xs font-bold uppercase tracking-wider py-3 hover:bg-white/[0.03]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showRejectModal && selectedBooking && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <form
            onSubmit={handleRejectSubmit}
            className="border border-white/10 bg-[#222222] shadow-2xl max-w-md w-full p-6 md:p-8 space-y-5"
          >
            <div className="flex justify-between items-start border-b border-white/10 pb-3">
              <div>
                <h3 className="font-bold text-white">Reject Raw Photo</h3>
                <p className="text-[10px] text-white/40 font-mono mt-0.5">{selectedBooking.id}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowRejectModal(false)}
                className="p-1 hover:bg-white/[0.05] rounded text-white/40"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-200 flex gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p>The client will be emailed with this reason and a link to submit another raw photo.</p>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-semibold tracking-widest text-white/45 uppercase">
                Rejection Reason
              </label>
              <select
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value as RawRejectionReason)}
                className={adminSelect}
              >
                <option value="blurry">Blurry Photo / Out of Focus</option>
                <option value="already_edited">Already Edited / Cropped / Filtered</option>
                <option value="invalid_link">Invalid Drive Link / Access Restricted</option>
                <option value="unmatching_booking">Does Not Match Booking Session Details</option>
                <option value="other">Other (custom reason below)</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-semibold tracking-widest text-white/45 uppercase">
                {rejectionReason === 'other' ? 'Custom Reason *' : 'Additional Notes (optional)'}
              </label>
              <textarea
                required={rejectionReason === 'other'}
                rows={3}
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                className="w-full bg-black/40 border border-white/10 focus:border-primary focus:outline-none p-3 text-xs resize-none text-white"
              />
            </div>

            <div className="flex gap-3 border-t border-white/10 pt-4">
              <button
                type="button"
                onClick={() => setShowRejectModal(false)}
                className="flex-1 border border-white/10 text-white/90 text-xs font-bold uppercase tracking-wider py-3"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={actionLoading}
                className="btn-reject-fx flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase tracking-wider py-3"
              >
                Confirm Rejection
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
