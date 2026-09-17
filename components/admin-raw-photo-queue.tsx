'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { type Booking } from '@/lib/data-store'
import { fetchFilteringBookings as getBookings, peekFilteringBookings as peekBookings, invalidateFilteringBookings } from '@/lib/filtering-read-cache'
import { invalidateEditorBatchCache } from '@/lib/editor-read-cache'
import { useAdminToast } from '@/components/admin-toast-provider'
import AdminPageHeader from '@/components/admin-page-header'
import { WorkspaceRefreshButton } from '@/components/workspace-refresh'
import { usePageBackgroundSync } from '@/components/use-cached-page-read'
import {
  Check,
  X,
  AlertCircle,
  Search,
  Image as ImageIcon,
  Clock,
  ChevronRight,
  List,
  RotateCcw,
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
type SelectionFile = { id: string; fileName: string; available: boolean; preference: string; extraEdit: boolean }

const RAW_REJECTION_MESSAGES: Record<RawRejectionReason, string> = {
  blurry: 'One or more of your selected photos are blurry or out of focus. Please replace them with clear, sharp photos.',
  already_edited:
    'One or more of your selected photos appear to have been edited, cropped, or filtered. We require the original raw photo files for professional editing.',
  invalid_link:
    'The client gallery is unavailable or empty. Confirm that the RAW photos finished uploading to private storage, then refresh the queue.',
  unmatching_booking:
    'The selected photos do not seem to match your booking details. Please verify your selection.',
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
  const [bookings, setBookings] = useState<Booking[]>(() => (peekBookings() ?? []).filter(hasRawPhotoSubmission))
  const [loading, setLoading] = useState(() => peekBookings() === undefined)
  const [refreshing, setRefreshing] = useState(false)
  const [searchTerm, setSearchTerm] = useState(initialSearch)
  const [activeTab, setActiveTab] = useState<FilteringTab>(initialSearch ? 'All' : 'Pending Review')
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectionReason, setRejectionReason] = useState<RawRejectionReason>('blurry')
  const [customReason, setCustomReason] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [selectionFiles, setSelectionFiles] = useState<SelectionFile[]>([])
  const [selectionFilesLoading, setSelectionFilesLoading] = useState(false)
  const [exiting, setExiting] = useState<{ id: string; type: 'approve' | 'reject' } | null>(null)

  /** Play the card exit animation before the queue refreshes (skipped on the All tab where cards stay visible). */
  const animateCardExit = async (bookingId: string, type: 'approve' | 'reject') => {
    if (activeTab === 'All') return
    setExiting({ id: bookingId, type })
    await new Promise((resolve) => window.setTimeout(resolve, 700))
    setBookings((prev) => prev.filter((b) => b.id !== bookingId))
    setExiting(null)
  }

  const fetchQueue = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true)
    try {
      const data = await getBookings()
      setBookings(data.filter(hasRawPhotoSubmission))
    } catch (err) {
      console.error(err)
      toast.error('Sync failed', 'Could not load photo selections. Try: refresh the page.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [toast])

  useEffect(() => {
    fetchQueue(true)
  }, [fetchQueue])

  usePageBackgroundSync(() => fetchQueue(true))

  const openSelectionDetails = async (booking: Booking) => {
    setSelectedBooking(booking)
    setSelectionFiles([])
    setSelectionFilesLoading(true)
    setShowDetailModal(true)
    try {
      const response = await fetch(`/api/editor-workflow/selections/${encodeURIComponent(booking.id)}/files`, {
        cache: 'no-store',
        credentials: 'include',
      })
      const body = (await response.json().catch(() => ({}))) as { files?: SelectionFile[]; error?: string }
      if (!response.ok) throw new Error(body.error || 'Could not load the selected photos.')
      setSelectionFiles(Array.isArray(body.files) ? body.files : [])
    } catch (error) {
      toast.error('Selection unavailable', error instanceof Error ? error.message : 'Try: refresh the queue.')
    } finally {
      setSelectionFilesLoading(false)
    }
  }

  const handleApprove = async (booking: Booking) => {
    if (!window.confirm(`Approve raw photo selection for ${booking.id}?`)) return

    setActionLoading(true)
    try {
      const res = await fetch(`/api/editor-workflow/filtering/${booking.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'Approve', notes: 'Approved for editing', submittedAt: booking.rawPhotoSubmittedAt }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to approve raw photo.')
      invalidateFilteringBookings()

      setShowDetailModal(false)
      setSelectedBooking(null)
      await animateCardExit(booking.id, 'approve')

      toast.success('Selection approved', `${booking.id} is approved for editing.`)
      if (Array.isArray(data.emailErrors) && data.emailErrors.length > 0) {
        toast.warning('Approved — email issue', data.emailErrors.join(' · '))
      }
      invalidateEditorBatchCache()
      fetchQueue(true)
    } catch (err) {
      console.error(err)
      toast.error('Approval failed', err instanceof Error ? err.message : 'Could not save changes. Try: refresh the page and try again.')
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
      const res = await fetch(`/api/editor-workflow/filtering/${selectedBooking.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'Reject', reason: finalReason, notes: notesText, submittedAt: selectedBooking.rawPhotoSubmittedAt }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to reject raw photo.')
      invalidateFilteringBookings()

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
      invalidateEditorBatchCache()
      fetchQueue(true)
    } catch (err) {
      console.error(err)
      toast.error('Rejection failed', err instanceof Error ? err.message : 'Could not save changes. Try: refresh the page and try again.')
    } finally {
      setActionLoading(false)
    }
  }

  const resendRejection = async (booking: Booking) => {
    setActionLoading(true)
    try {
      const response = await fetch(`/api/editor-workflow/filtering/${booking.id}/review`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'RetryEmail', submittedAt: booking.rawPhotoSubmittedAt }),
      })
      const body = await response.json()
      if (!response.ok || body.emailErrors?.length) throw new Error(body.error || body.emailErrors.join(' · '))
      toast.success('Email sent', 'The client can reopen their portal from the email.')
    } catch (error) {
      toast.error('Email not sent', error instanceof Error ? error.message : 'Try: check email settings and retry.')
    } finally { setActionLoading(false) }
  }

  const handleReopen = async (booking: Booking) => {
    if (!window.confirm(`Reopen photo selection for ${booking.id}? The client will be notified and can submit a new selection.`)) return
    setActionLoading(true)
    try {
      const response = await fetch(`/api/editor-workflow/filtering/${booking.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'Reopen', notes: 'Reopened by the studio', submittedAt: booking.rawPhotoSubmittedAt }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Could not reopen the selection.')
      invalidateFilteringBookings()
      invalidateEditorBatchCache()
      setBookings((current) => current.map((item) => item.id === booking.id
        ? { ...item, rawPhotoStatus: 'Reopened', rawPhotoNotes: undefined, rawPhotoApprovedAt: undefined }
        : item))
      setShowDetailModal(false)
      setSelectedBooking(null)
      if (Array.isArray(body.emailErrors) && body.emailErrors.length > 0) {
        toast.warning('Selection reopened — email issue', body.emailErrors.join(' · '))
      } else {
        toast.success('Selection reopened', `${booking.id} is open for a new selection. Client notified.`)
      }
      void fetchQueue(true)
    } catch (error) {
      console.error(error)
      toast.error('Reopen failed', error instanceof Error ? error.message : 'Could not reopen the selection. Try: sync the queue and try again.')
    } finally {
      setActionLoading(false)
    }
  }

  const resendReopenEmail = async (booking: Booking) => {
    setActionLoading(true)
    try {
      const response = await fetch(`/api/editor-workflow/filtering/${booking.id}/review`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'RetryReopenEmail', submittedAt: booking.rawPhotoSubmittedAt }),
      })
      const body = await response.json()
      if (!response.ok || body.emailErrors?.length) throw new Error(body.error || body.emailErrors.join(' · '))
      toast.success('Email sent', 'The client was notified that the portal is open again.')
    } catch (error) {
      toast.error('Email not sent', error instanceof Error ? error.message : 'Try: check email settings and retry.')
    } finally { setActionLoading(false) }
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
          subtitle="Review selected photos and send feedback."
          onRefresh={() => fetchQueue()}
          refreshing={refreshing}
        >
          <Link
            href="/editor/onsite"
            className="inline-flex items-center gap-1.5 rounded-control border border-white/10 bg-white/5 hover:bg-white/10 px-4 py-2.5 text-caption font-semibold uppercase tracking-wider transition-colors"
          >
            <List className="w-3.5 h-3.5" /> Onsite Upload
          </Link>
        </AdminPageHeader>
      )}

      {embedded && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-white/50">
            Review client photo selections — approve for editing or reject with feedback.
          </p>
          <WorkspaceRefreshButton onRefresh={() => fetchQueue()} refreshing={refreshing} />
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
                  className={`text-caption px-1.5 py-0.5 rounded-full font-bold ${
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

      <div className="rounded-card border border-white/10 bg-white/[0.01] p-4">
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
        <p className="text-caption text-white/45 mt-3">
          Showing <span className="font-semibold text-white/70">{filteredBookings.length}</span> of{' '}
          <span className="font-semibold text-white/70">{countAll}</span> raw photo submissions
        </p>
      </div>

      {loading && bookings.length === 0 ? (
        <div className={adminSpinnerWrap}>
          <div className={adminSpinner} />
        </div>
      ) : filteredBookings.length === 0 ? (
        <div className="rounded-card border border-white/10 bg-white/[0.01] p-16 text-center shadow-sm">
          <div className="w-16 h-16 bg-white/[0.03] border border-white/10 flex items-center justify-center text-white/40 rounded-full mx-auto mb-4">
            <ImageIcon className="w-7 h-7" />
          </div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-white">No submissions found</h3>
          <p className="text-xs text-white/40 mt-1 max-w-md mx-auto">
            Submitted Client Portal selections will appear here for review.
          </p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredBookings.map((booking) => {
            const status = booking.rawPhotoStatus || 'Pending Review'
            return (
              <div
                key={booking.id}
                className={`rounded-card border border-white/10 bg-white/[0.02] flex flex-col justify-between overflow-hidden ${adminCardHover} ${exiting?.id === booking.id ? (exiting.type === 'approve' ? 'card-approve-exit' : 'card-reject-exit') : ''}`}
              >
                <div className="p-5 space-y-4 flex-1">
                  <div className="flex justify-between items-start border-b border-white/10 pb-3 gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-white truncate">{booking.customerName}</h3>
                      <Link
                        href={`/editor/filtering?search=${encodeURIComponent(booking.id)}&tab=queue`}
                        className="text-caption text-primary font-mono mt-0.5 hover:underline"
                      >
                        {booking.id}
                      </Link>
                    </div>
                    <span className="text-caption bg-primary/10 text-primary border border-primary/20 font-bold px-2 py-0.5 rounded uppercase max-w-[110px] truncate shrink-0">
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
                      <div className="flex justify-between items-center text-caption pt-1 text-white/50 gap-2">
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
                    className={`inline-flex items-center gap-2 px-2 py-1 text-caption font-semibold uppercase tracking-wider border rounded ${rawPhotoStatusBadgeClass(status)}`}
                  >
                    <span className="w-2 h-2 rounded-full bg-current shrink-0" />
                    {status}
                  </span>

                  {status === 'Rejected' && booking.rawPhotoNotes && (
                    <div className="rounded-control text-caption p-2 bg-red-950/20 border border-red-500/10 text-red-200 italic">
                      &ldquo;{booking.rawPhotoNotes}&rdquo;
                    </div>
                  )}
                </div>

                <div className="bg-white/[0.03] px-5 py-4 border-t border-white/10 space-y-3">
                  <button
                    type="button"
                    onClick={() => void openSelectionDetails(booking)}
                    className="w-full rounded-control bg-[#0500D0]/10 hover:bg-[#0500D0]/20 border border-[#0500D0]/30 text-white text-xs font-semibold py-2.5 flex items-center justify-center gap-1.5 transition-colors uppercase tracking-wider"
                  >
                    Review Selected Photos <ChevronRight className="w-3.5 h-3.5" />
                  </button>

                  {status === 'Pending Review' && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleApprove(booking)}
                        disabled={actionLoading}
                        className="btn-approve-fx flex-1 bg-green-600 hover:bg-green-700 text-white text-caption font-semibold uppercase tracking-wider py-2 flex items-center justify-center gap-1"
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
                        className="btn-reject-fx flex-1 bg-red-600 hover:bg-red-700 text-white text-caption font-semibold uppercase tracking-wider py-2 flex items-center justify-center gap-1"
                      >
                        <X className="w-3.5 h-3.5" /> Reject
                      </button>
                    </div>
                  )}

                  {status === 'Approved' && (
                    <button
                      type="button"
                      onClick={() => void handleReopen(booking)}
                      disabled={actionLoading}
                      className="flex w-full items-center justify-center gap-1.5 rounded-control border border-amber-400/25 bg-amber-400/[0.07] py-2.5 text-caption font-semibold uppercase tracking-wider text-amber-200 transition hover:border-amber-300/45 hover:bg-amber-400/[0.12] disabled:opacity-40"
                    >
                      <RotateCcw className="size-3.5" /> Reopen
                    </button>
                  )}

                  {status === 'Reopened' && (
                    <button
                      type="button"
                      onClick={() => void resendReopenEmail(booking)}
                      disabled={actionLoading}
                      className="flex w-full items-center justify-center gap-1.5 rounded-control border border-white/10 py-2.5 text-caption font-semibold uppercase tracking-wider text-white/65 transition hover:border-white/25 hover:text-white disabled:opacity-40"
                    >
                      Resend Email
                    </button>
                  )}

                  {(status === 'Approved' || status === 'Rejected' || status === 'Reopened') && (
                    <button
                      type="button"
                      onClick={() => void openSelectionDetails(booking)}
                      className="w-full text-center text-white/50 hover:text-white text-caption uppercase tracking-wider py-1 font-semibold flex items-center justify-center gap-1 hover:underline"
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
          <div className="max-h-[90vh] w-full max-w-4xl space-y-6 overflow-y-auto rounded-card border border-white/10 bg-[#222222] p-6 shadow-2xl md:p-8">
            <div className="flex justify-between items-start border-b border-white/10 pb-3">
              <div>
                <h3 className="font-bold text-white text-lg">Selected Photos</h3>
                <p className="text-caption text-white/40 font-mono mt-0.5">{selectedBooking.id}</p>
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
              {selectionFilesLoading ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5" aria-label="Loading selected photos">
                  {Array.from({ length: 5 }, (_, index) => <div key={index} className="aspect-[4/5] animate-pulse rounded-control bg-white/[0.06]" />)}
                </div>
              ) : selectionFiles.length ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
                  {selectionFiles.map((file) => (
                    <figure key={file.id} className="overflow-hidden rounded-control border border-white/10 bg-black/25">
                      {file.available ? (
                        <img
                          src={`/api/editor-workflow/files/${encodeURIComponent(file.id)}?variant=thumbnail`}
                          alt={file.fileName}
                          className="aspect-[4/5] w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex aspect-[4/5] items-center justify-center p-3 text-center text-caption text-amber-200/70">Photo unavailable</div>
                      )}
                      <figcaption className="space-y-1 p-2">
                        <p className="truncate text-caption font-medium text-white/75" title={file.fileName}>{file.fileName}</p>
                        <p className="text-caption text-white/35">{file.extraEdit ? 'Extra edit' : 'Included'} · {file.preference}</p>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              ) : (
                <p className="rounded-control border border-white/10 bg-black/20 p-4 text-caption text-white/45">No selected photos are available for this submission.</p>
              )}
            </div>

            <div className="flex gap-3 border-t border-white/10 pt-4">
              {selectedBooking.rawPhotoStatus === 'Rejected' && (
                <button
                  type="button"
                  onClick={() => resendRejection(selectedBooking)}
                  disabled={actionLoading}
                  className="btn-approve-fx flex-1 bg-green-600 hover:bg-green-700 text-white text-xs font-bold uppercase tracking-wider py-3"
                >
                  Resend Email
                </button>
              )}
              {selectedBooking.rawPhotoStatus === 'Approved' && (
                <button
                  type="button"
                  onClick={() => void handleReopen(selectedBooking)}
                  disabled={actionLoading}
                  className="flex-1 rounded-control border border-amber-400/25 bg-amber-400/[0.07] py-3 text-xs font-bold uppercase tracking-wider text-amber-200 hover:bg-amber-400/[0.12] disabled:opacity-40"
                >
                  Reopen
                </button>
              )}
              {selectedBooking.rawPhotoStatus === 'Reopened' && (
                <button
                  type="button"
                  onClick={() => void resendReopenEmail(selectedBooking)}
                  disabled={actionLoading}
                  className="flex-1 rounded-control border border-white/10 py-3 text-xs font-bold uppercase tracking-wider text-white/80 hover:bg-white/[0.03] disabled:opacity-40"
                >
                  Resend Email
                </button>
              )}
              {selectedBooking.rawPhotoStatus === 'Pending Review' && (
                <button
                  type="button"
                  onClick={() => {
                    setRejectionReason('blurry')
                    setShowRejectModal(true)
                  }}
                  disabled={actionLoading}
                  className="btn-reject-fx flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase tracking-wider py-3"
                >
                  Reject Selection
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setShowDetailModal(false)
                  setSelectedBooking(null)
                }}
                className="flex-1 rounded-control border border-white/10 text-white/90 text-xs font-bold uppercase tracking-wider py-3 hover:bg-white/[0.03]"
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
            className="rounded-card border border-white/10 bg-[#222222] shadow-2xl max-w-md w-full p-6 md:p-8 space-y-5"
          >
            <div className="flex justify-between items-start border-b border-white/10 pb-3">
              <div>
                <h3 className="font-bold text-white">Reject Raw Photo</h3>
                <p className="text-caption text-white/40 font-mono mt-0.5">{selectedBooking.id}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowRejectModal(false)}
                className="p-1 hover:bg-white/[0.05] rounded text-white/40"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="rounded-control bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-200 flex gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p>The client will be emailed with this reason and a link to submit another raw photo.</p>
            </div>

            <div className="space-y-2">
              <label className="text-caption font-semibold tracking-label text-white/45 uppercase">
                Rejection Reason
              </label>
              <select
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value as RawRejectionReason)}
                className={adminSelect}
              >
                <option value="blurry">Blurry Photo / Out of Focus</option>
                <option value="already_edited">Already Edited / Cropped / Filtered</option>
                <option value="invalid_link">Gallery Unavailable / Photos Missing</option>
                <option value="unmatching_booking">Does Not Match Booking Session Details</option>
                <option value="other">Other (custom reason below)</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-caption font-semibold tracking-label text-white/45 uppercase">
                {rejectionReason === 'other' ? 'Custom Reason *' : 'Additional Notes (optional)'}
              </label>
              <textarea
                required={rejectionReason === 'other'}
                rows={3}
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                className="w-full rounded-control bg-black/40 border border-white/10 focus:border-primary focus:outline-none p-3 text-xs resize-none text-white"
              />
            </div>

            <div className="flex gap-3 border-t border-white/10 pt-4">
              <button
                type="button"
                onClick={() => setShowRejectModal(false)}
                className="flex-1 rounded-control border border-white/10 text-white/90 text-xs font-bold uppercase tracking-wider py-3"
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
