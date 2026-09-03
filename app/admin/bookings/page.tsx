'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  getBookings,
  getBookingPackages,
  addNotification,
  uploadReceipt,
  Booking,
  PaymentRecord,
} from '@/lib/data-store'
import { runAdminTransaction, formatEmailResult } from '@/lib/admin-actions'
import { dispatchEmail } from '@/lib/email-dispatch'
import { useAdminToast } from '@/components/admin-toast-provider'
import AdminPageHeader from '@/components/admin-page-header'
import { useOnAdminDbSync } from '@/components/admin-auto-sync'
import { GraduationSessionDetails } from '@/components/graduation-session-details'
import AdminBookingRawPhoto from '@/components/admin-booking-raw-photo'
import { parsePackagePrice, usesMakeupSlots, isWalkInEligiblePackage, BOOKING_PACKAGE_CATEGORY_LABELS, type BookingPackage, type BookingPackageCategory } from '@/lib/booking-packages'
import {
  MANA_SESSION_BLOCKS,
  ALL_MANA_SLOTS,
  FICO_ARRIVAL_LABEL,
  FICO_BOOKING_TIME_LABEL,
  formatSlotBookingTime,
  findSlotByBookingTime,
  getSlotById,
} from '@/lib/booking-slots'
import { generateBookingId } from '@/lib/booking-id'
import { enrichBookingDisplay, filterBookings } from '@/lib/booking-display'
import { buildDayPriorityMap, getDayPriorityCount } from '@/lib/booking-priority'
import { isPlaceholderCustomerEmail } from '@/lib/customer-email'
import AdminReceiptActions from '@/components/admin-receipt-actions'
import BookingPrioritySelect from '@/components/booking-priority-select'
import { 
  Search, 
  Filter, 
  Eye, 
  Calendar, 
  Trash2, 
  CheckCircle, 
  Clock, 
  XCircle, 
  Edit,
  ArrowUpRight,
  X,
  Save,
  Check,
  FileText,
  Upload,
  Link2,
  Bell,
} from 'lucide-react'
import Image from 'next/image'
import {
  adminPage,
  adminInput,
  adminSelect,
  adminLabel,
  adminBtnPrimary,
  adminTableWrap,
  adminTableHead,
  adminTableRow,
  adminSpinnerWrap,
  adminSpinner,
  adminOverlay,
  adminDrawer,
  adminPanel,
  bookingStatusBadge,
  paymentStatusBadge,
} from '@/lib/admin-ui'

export default function BookingsManagementPage() {
  return (
    <Suspense fallback={<div className={adminSpinnerWrap}><div className={adminSpinner} /></div>}>
      <BookingsManagement />
    </Suspense>
  )
}

function BookingsManagement() {
  const searchParams = useSearchParams()
  const toast = useAdminToast()
  const [bookings, setBookings] = useState<Booking[]>([])
  const [filteredBookings, setFilteredBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Search & Filter states
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [paymentFilter, setPaymentFilter] = useState('All')
  const [packageFilter, setPackageFilter] = useState('All')
  const [dateFilter, setDateFilter] = useState('')

  // Selected Booking Drawer/Modal states
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editDate, setEditDate] = useState('')
  const [editTime, setEditTime] = useState('')
  const [editStaffNotes, setEditStaffNotes] = useState('')
  const [chargeRebookingFee, setChargeRebookingFee] = useState(false)
  const [editDriveLink, setEditDriveLink] = useState('')
  const [saveLoading, setSaveLoading] = useState(false)
  const [showCompleteModal, setShowCompleteModal] = useState(false)
  const [completeModalMode, setCompleteModalMode] = useState<'complete' | 'gallery'>('complete')
  const [completeDriveLink, setCompleteDriveLink] = useState('')
  const [completeSendEmail, setCompleteSendEmail] = useState(true)
  const [completeClientName, setCompleteClientName] = useState('')
  const [completeClientEmail, setCompleteClientEmail] = useState('')
  const [editContactName, setEditContactName] = useState('')
  const [editContactEmail, setEditContactEmail] = useState('')
  const [editContactPhone, setEditContactPhone] = useState('')
  const [editingContact, setEditingContact] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Booking | null>(null)
  const [deleteReason, setDeleteReason] = useState<'admin_error' | 'client_error'>('admin_error')
  const [deleteNotes, setDeleteNotes] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)

  // In-studio Payment states
  const [studioPayMethod, setStudioPayMethod] = useState<'Cash' | 'GCash' | 'Card' | 'Maya' | 'Bank Transfer'>('Cash')
  const [studioPayAmount, setStudioPayAmount] = useState<number>(0)
  const [studioPayRef, setStudioPayRef] = useState('')

  const [showWalkIn, setShowWalkIn] = useState(false)
  const [walkInName, setWalkInName] = useState('')
  const [walkInPhone, setWalkInPhone] = useState('')
  const [walkInDate, setWalkInDate] = useState('')
  const [walkInPackage, setWalkInPackage] = useState('fico-package')
  const [walkInCategory, setWalkInCategory] = useState<BookingPackageCategory>('graduation')
  const [walkInSlotId, setWalkInSlotId] = useState('')
  const [walkInReceiptFile, setWalkInReceiptFile] = useState<File | null>(null)
  const [walkInSaving, setWalkInSaving] = useState(false)
  const [allPackages, setAllPackages] = useState<BookingPackage[]>([])

  const walkInPackages = allPackages.filter(isWalkInEligiblePackage)
  const walkInPackagesInCategory = walkInPackages.filter((pkg) => pkg.category === walkInCategory)
  const walkInNeedsSlot = usesMakeupSlots(walkInPackage)
  const selectedWalkInPackage = walkInPackages.find((pkg) => pkg.id === walkInPackage)

  const fetchBookings = async (silent = false) => {
    if (!silent) setRefreshing(true)
    try {
      const data = await getBookings()
      setBookings(data)
      setFilteredBookings(data)
    } catch (err) {
      console.error(err)
      toast.error('Sync failed', 'Could not load bookings from database.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    setSearchTerm(searchParams.get('search')?.trim() ?? '')
    setDateFilter(searchParams.get('date')?.trim() ?? '')
  }, [searchParams])

  useEffect(() => {
    fetchBookings(true)
    getBookingPackages().then((pkgs) => {
      setAllPackages(pkgs)
      const eligible = pkgs.filter(isWalkInEligiblePackage)
      if (eligible.length > 0 && !eligible.some((pkg) => pkg.id === walkInPackage)) {
        setWalkInPackage(eligible[0].id)
        setWalkInCategory(eligible[0].category)
      }
    })
  }, [])

  useEffect(() => {
    if (walkInPackagesInCategory.length === 0) return
    if (!walkInPackagesInCategory.some((pkg) => pkg.id === walkInPackage)) {
      setWalkInPackage(walkInPackagesInCategory[0].id)
      setWalkInSlotId('')
    }
  }, [walkInCategory, walkInPackagesInCategory, walkInPackage])

  useOnAdminDbSync(() => fetchBookings(true))

  const handleWalkInSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!walkInName || !walkInPhone || !walkInDate) return

    const pkg = selectedWalkInPackage ?? walkInPackages.find((item) => item.id === walkInPackage)
    if (!pkg) {
      toast.error('Walk-in failed', 'Please select a valid package.')
      return
    }
    if (walkInNeedsSlot && !walkInSlotId) return

    setWalkInSaving(true)
    try {
      const slot = walkInSlotId ? getSlotById(walkInSlotId) : undefined
      const id = generateBookingId(bookings.map((b) => b.id))

      let receiptUrl: string | undefined
      if (walkInReceiptFile) {
        receiptUrl = await uploadReceipt(id, walkInReceiptFile)
      }

      const depositRecord: PaymentRecord | undefined = receiptUrl
        ? {
            id: 'PAY-' + Math.floor(1000 + Math.random() * 9000),
            amount: 500,
            method: 'Cash',
            type: 'Deposit',
            date: new Date().toISOString(),
          }
        : undefined

      await runAdminTransaction({
        id,
        customerName: walkInName,
        customerEmail: 'walkin@ficomana.local',
        customerPhone: walkInPhone,
        customerFbLink: '',
        customerFbName: walkInName,
        packageId: pkg.id,
        packageName: pkg.title,
        bookingDate: walkInDate,
        bookingTime: slot ? formatSlotBookingTime(slot) : FICO_BOOKING_TIME_LABEL,
        slotId: slot?.id,
        arrivalTime: slot?.arrivalTime ?? FICO_ARRIVAL_LABEL,
        shootTime: slot?.shootTime ?? 'Flexible (Available anytime from 8:00 AM – 4:00 PM)',
        isWalkIn: true,
        depositAmount: 500,
        price: parsePackagePrice(pkg.price),
        bookingStatus: 'Confirmed',
        paymentStatus: 'Paid Deposit',
        createdAt: new Date().toISOString(),
        receiptUrl,
        paymentHistory: depositRecord ? [depositRecord] : [],
      })
      await addNotification(id, 'NEW_BOOKING', `Walk-in booking ${id} created for ${walkInName}.`)
      if (receiptUrl) {
        await addNotification(id, 'RECEIPT_UPLOAD', `Walk-in receipt uploaded for ${id}.`)
      }
      setWalkInName('')
      setWalkInPhone('')
      setWalkInDate('')
      setWalkInSlotId('')
      setWalkInReceiptFile(null)
      setShowWalkIn(false)
      await fetchBookings(true)
      toast.success(
        'Walk-in saved',
        receiptUrl ? `${id} confirmed with receipt on file.` : `${id} confirmed in database.`,
      )
    } catch (err) {
      console.error(err)
      toast.error('Walk-in failed', err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setWalkInSaving(false)
    }
  }

  // Apply filters in real time (sorted by day priority: earliest session = #1)
  useEffect(() => {
    setFilteredBookings(
      filterBookings(bookings, {
        searchTerm,
        statusFilter,
        paymentFilter,
        packageFilter,
        dateFilter,
      }),
    )
  }, [searchTerm, statusFilter, paymentFilter, packageFilter, dateFilter, bookings])

  /** Client numbers from full day roster so filters don't renumber Client 1, 2, …. */
  const dayPriorityMap = useMemo(() => buildDayPriorityMap(bookings), [bookings])

  const hasActiveFilters =
    Boolean(searchTerm.trim()) ||
    Boolean(dateFilter) ||
    statusFilter !== 'All' ||
    paymentFilter !== 'All' ||
    packageFilter !== 'All'

  const clearFilters = () => {
    setSearchTerm('')
    setDateFilter('')
    setStatusFilter('All')
    setPaymentFilter('All')
    setPackageFilter('All')
  }

  const handleOpenDetails = (booking: Booking) => {
    const b = enrichBookingDisplay(booking)
    setSelectedBooking(b)
    setEditDate(b.bookingDate)
    // Prefer slotId → formatted label so the time <select> matches an option
    const slotFromId = b.slotId ? getSlotById(b.slotId) : undefined
    const slotFromTime = findSlotByBookingTime(b.bookingTime)
    const resolvedEditSlot = slotFromId ?? slotFromTime
    setEditTime(
      usesMakeupSlots(b.packageId)
        ? resolvedEditSlot
          ? formatSlotBookingTime(resolvedEditSlot)
          : b.bookingTime
        : FICO_BOOKING_TIME_LABEL,
    )
    setEditStaffNotes(b.staffNotes || '')
    setChargeRebookingFee(false)
    setEditDriveLink(booking.driveLink || '')
    setIsEditing(false)
    setEditingContact(false)
    setEditContactName(booking.customerName || '')
    setEditContactEmail(
      isPlaceholderCustomerEmail(booking.customerEmail) ? '' : booking.customerEmail || '',
    )
    setEditContactPhone(
      !booking.customerPhone || booking.customerPhone === '0000000000' ? '' : booking.customerPhone,
    )

    const paidSum = (booking.paymentHistory || []).reduce((acc, pay) => acc + pay.amount, 0)
    setStudioPayAmount(booking.price - paidSum)
    setStudioPayRef('')
    setStudioPayMethod('Cash')
  }

  const handleRecordStudioPayment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedBooking) return

    const paidSumBefore = (selectedBooking.paymentHistory || []).reduce((acc, pay) => acc + pay.amount, 0)
    const maxAllowed = selectedBooking.price - paidSumBefore

    if (studioPayAmount <= 0) {
      toast.warning('Invalid amount', 'Payment must be greater than zero.')
      return
    }
    if (studioPayAmount > maxAllowed) {
      toast.warning('Amount too high', `Maximum balance is ₱${maxAllowed.toFixed(2)}.`)
      return
    }

    setSaveLoading(true)
    try {
      const newRecord: PaymentRecord = {
        id: 'PAY-' + Math.floor(1000 + Math.random() * 9000),
        amount: studioPayAmount,
        method: studioPayMethod,
        type: 'Balance Payment',
        transactionRef: studioPayRef || undefined,
        date: new Date().toISOString()
      }

      const updatedHistory = [...(selectedBooking.paymentHistory || []), newRecord]
      const totalPaid = updatedHistory.reduce((acc, pay) => acc + pay.amount, 0)
      const isFullyPaid = totalPaid >= selectedBooking.price

      const updatedBooking: Booking = {
        ...selectedBooking,
        paymentStatus: isFullyPaid ? 'Paid Full' : 'Paid Deposit',
        // Do NOT auto-complete here — Complete Session is where staff paste Drive + email gallery.
        paymentHistory: updatedHistory,
      }

      const { saved, emailErrors } = await runAdminTransaction(updatedBooking, [
        { action: 'transaction_both', booking: updatedBooking, payment: newRecord },
        ...(isFullyPaid ? [{ action: 'final_receipt' as const, booking: updatedBooking }] : []),
      ])

      setSelectedBooking(saved)
      fetchBookings(true)

      const emailMsg = formatEmailResult(emailErrors)
      if (emailMsg) {
        toast.warning('Payment saved — email issue', emailMsg)
      } else if (isFullyPaid) {
        toast.success(
          'Studio payment recorded',
          `₱${studioPayAmount.toFixed(2)} logged · paid in full. Use Complete to send the Drive gallery.`,
        )
      } else {
        toast.success(
          'Partial payment recorded',
          `₱${studioPayAmount.toFixed(2)} — balance ₱${(selectedBooking.price - totalPaid).toFixed(2)}.`,
        )
      }
    } catch (err) {
      console.error(err)
      toast.error('Payment failed', err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setSaveLoading(false)
    }
  }

  const handleSaveDetails = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedBooking) return

    setSaveLoading(true)
    try {
      const isMakeup = usesMakeupSlots(selectedBooking.packageId)
      const resolvedSlot = isMakeup ? findSlotByBookingTime(editTime) : undefined
      if (isMakeup && !resolvedSlot) {
        toast.error('Invalid slot', 'Pick a valid MANA session time slot.')
        return
      }

      const nextTime = resolvedSlot ? formatSlotBookingTime(resolvedSlot) : FICO_BOOKING_TIME_LABEL
      const dateChanged =
        editDate !== selectedBooking.bookingDate ||
        nextTime !== selectedBooking.bookingTime ||
        (resolvedSlot?.id || '') !== (selectedBooking.slotId || '')
      const addedFee = dateChanged && chargeRebookingFee ? 500 : 0
      const driveLinkChanged = editDriveLink !== (selectedBooking.driveLink || '')

      const updatedBooking: Booking = {
        ...selectedBooking,
        bookingDate: editDate,
        bookingTime: nextTime,
        slotId: resolvedSlot?.id,
        arrivalTime: resolvedSlot?.arrivalTime ?? (isMakeup ? selectedBooking.arrivalTime : FICO_ARRIVAL_LABEL),
        shootTime: resolvedSlot?.shootTime ?? (isMakeup ? selectedBooking.shootTime : 'Flexible'),
        staffNotes: editStaffNotes,
        price: selectedBooking.price + addedFee,
        driveLink: editDriveLink || undefined,
      }

      const { saved, emailErrors } = await runAdminTransaction(updatedBooking, [
        ...(dateChanged ? [{ action: 'booking_rescheduled' as const, booking: updatedBooking, rebookingFee: addedFee }] : []),
        ...(driveLinkChanged && editDriveLink
          ? [{ action: 'gallery_link' as const, booking: updatedBooking, driveLink: editDriveLink }]
          : []),
      ])

      setSelectedBooking(saved)
      setEditDate(saved.bookingDate)
      setEditTime(
        usesMakeupSlots(saved.packageId) && saved.slotId && getSlotById(saved.slotId)
          ? formatSlotBookingTime(getSlotById(saved.slotId)!)
          : saved.bookingTime,
      )
      setIsEditing(false)
      fetchBookings(true)

      const emailMsg = formatEmailResult(emailErrors)
      if (emailMsg) {
        toast.warning('Saved — email issue', emailMsg)
      } else if (driveLinkChanged && editDriveLink) {
        toast.success('Details updated', 'Reschedule saved & gallery link emailed.')
      } else if (dateChanged) {
        toast.success('Rescheduled', 'Booking moved — customer notified.')
      } else {
        toast.success('Details saved', 'Booking updated in database.')
      }
    } catch (err) {
      console.error(err)
      toast.error('Save failed', err instanceof Error ? err.message : 'Could not update booking.')
    } finally {
      setSaveLoading(false)
    }
  }

  const handleSaveStaffNotes = async () => {
    if (!selectedBooking) return
    setSaveLoading(true)
    try {
      const updated = { ...selectedBooking, staffNotes: editStaffNotes }
      const { saved } = await runAdminTransaction(updated)
      setSelectedBooking(saved)
      fetchBookings(true)
      toast.success('Staff notes saved', 'Internal notes updated in database.')
    } catch (err) {
      toast.error('Save failed', err instanceof Error ? err.message : 'Could not save notes.')
    } finally {
      setSaveLoading(false)
    }
  }

  const openDeleteModal = (booking: Booking) => {
    setDeleteTarget(booking)
    setDeleteReason('admin_error')
    setDeleteNotes('')
    setShowDeleteModal(true)
  }

  const handleDeleteBooking = async () => {
    if (!deleteTarget) return
    setDeleteLoading(true)
    try {
      const res = await fetch(`/api/bookings/${encodeURIComponent(deleteTarget.id)}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: deleteReason, notes: deleteNotes.trim() || undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error || 'Failed to delete booking.')

      if (selectedBooking?.id === deleteTarget.id) setSelectedBooking(null)
      setShowDeleteModal(false)
      setDeleteTarget(null)
      fetchBookings(true)
      toast.success(
        'Booking deleted',
        `${deleteTarget.id} removed (${deleteReason === 'admin_error' ? 'Admin error' : 'Client error'}).`,
      )
    } catch (err) {
      console.error(err)
      toast.error('Delete failed', err instanceof Error ? err.message : 'Could not delete booking.')
    } finally {
      setDeleteLoading(false)
    }
  }

  const openGalleryLinkModal = (booking: Booking, mode: 'complete' | 'gallery' = 'gallery') => {
    setCompleteModalMode(mode)
    setCompleteDriveLink(booking.driveLink || '')
    setCompleteSendEmail(true)
    setCompleteClientName(booking.customerName || '')
    setCompleteClientEmail(
      isPlaceholderCustomerEmail(booking.customerEmail) ? '' : booking.customerEmail || '',
    )
    setShowCompleteModal(true)
  }

  const handleSendShootReminder = async (booking: Booking) => {
    if (isPlaceholderCustomerEmail(booking.customerEmail)) {
      toast.warning('Client email required', 'Add a valid client email before sending the shoot reminder.')
      return
    }
    if (!window.confirm(`Send shoot reminder email to ${booking.customerEmail}?`)) return

    setSaveLoading(true)
    try {
      const result = await dispatchEmail({ action: 'booking_reminder', booking })
      if (!result.success) {
        toast.warning('Reminder not sent', result.error || 'Email failed.')
      } else {
        toast.success('Reminder sent', `Shoot reminder emailed to ${booking.customerEmail}.`)
      }
    } catch (err) {
      toast.error('Reminder failed', err instanceof Error ? err.message : 'Could not send email.')
    } finally {
      setSaveLoading(false)
    }
  }

  const handleUpdateStatus = async (booking: Booking, status: Booking['bookingStatus']) => {
    if (status === 'Completed') {
      openGalleryLinkModal(booking, 'complete')
      return
    }

    if (!window.confirm(`Update ${booking.id} to ${status}?`)) return

    setSaveLoading(true)
    try {
      const payStatus = status === 'Cancelled' ? 'Refunded' : booking.paymentStatus

      const updatedBooking: Booking = {
        ...booking,
        bookingStatus: status,
        paymentStatus: payStatus,
      }

      const emails =
        status === 'Cancelled'
          ? [{ action: 'booking_cancelled' as const, booking: updatedBooking }]
          : []

      const { emailErrors } = await runAdminTransaction(updatedBooking, emails)

      if (selectedBooking?.id === booking.id) setSelectedBooking(updatedBooking)
      fetchBookings(true)

      const emailMsg = formatEmailResult(emailErrors)
      if (emailMsg) {
        toast.warning(`Status → ${status} — email issue`, emailMsg)
      } else {
        toast.success(`Status → ${status}`, `${booking.id} updated in database.`)
      }
    } catch (err) {
      console.error(err)
      toast.error('Status update failed', err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setSaveLoading(false)
    }
  }

  const handleSaveContact = async () => {
    if (!selectedBooking) return
    const name = editContactName.trim()
    const email = editContactEmail.trim()
    const phone = editContactPhone.trim()

    if (!name) {
      toast.warning('Name required', 'Enter the client full name.')
      return
    }
    if (!email || !email.includes('@') || isPlaceholderCustomerEmail(email)) {
      toast.warning('Valid email required', 'Enter the client email so gallery and edit links can be sent.')
      return
    }

    setSaveLoading(true)
    try {
      const updatedBooking: Booking = {
        ...selectedBooking,
        customerName: name,
        customerEmail: email,
        customerPhone: phone || selectedBooking.customerPhone,
        customerFbName: selectedBooking.customerFbName || name,
      }
      const { saved } = await runAdminTransaction(updatedBooking, [])
      setSelectedBooking(saved)
      setEditingContact(false)
      fetchBookings(true)
      toast.success('Contact updated', `${saved.id} name & email saved.`)
    } catch (err) {
      console.error(err)
      toast.error('Save failed', err instanceof Error ? err.message : 'Could not save contact.')
    } finally {
      setSaveLoading(false)
    }
  }

  const handleConfirmComplete = async (opts: { sendEmail: boolean }) => {
    if (!selectedBooking) return

    const driveLink = completeDriveLink.trim()
    const clientName = completeClientName.trim()
    const clientEmail = completeClientEmail.trim()
    const galleryOnly = completeModalMode === 'gallery'
    const alreadyCompleted = selectedBooking.bookingStatus === 'Completed'

    if (!clientName) {
      toast.warning('Name required', 'Enter the client full name.')
      return
    }

    // Gallery send always needs a Drive link; Complete can optionally skip email
    if (galleryOnly || opts.sendEmail) {
      if (!driveLink) {
        toast.warning('Drive link required', 'Paste the Google Drive gallery link to email the client.')
        return
      }
      if (!driveLink.startsWith('https://drive.google.com/')) {
        toast.warning('Invalid link', 'Use a Google Drive link (https://drive.google.com/...).')
        return
      }
    }

    if (opts.sendEmail || galleryOnly) {
      if (!clientEmail || !clientEmail.includes('@') || isPlaceholderCustomerEmail(clientEmail)) {
        toast.warning('Client email required', 'Enter the client email to send the raw gallery link.')
        return
      }
    }

    setSaveLoading(true)
    try {
      const paidSum = (selectedBooking.paymentHistory || []).reduce((acc, pay) => acc + pay.amount, 0)
      const shouldEmail = galleryOnly ? true : opts.sendEmail
      const updatedBooking: Booking = {
        ...selectedBooking,
        customerName: clientName,
        customerEmail: clientEmail || selectedBooking.customerEmail,
        customerFbName: selectedBooking.customerFbName || clientName,
        // Gallery send marks session complete so filtering can proceed; already-completed stays put.
        bookingStatus:
          selectedBooking.bookingStatus === 'Cancelled'
            ? selectedBooking.bookingStatus
            : 'Completed',
        paymentStatus: paidSum >= selectedBooking.price ? 'Paid Full' : selectedBooking.paymentStatus,
        driveLink: driveLink || selectedBooking.driveLink || undefined,
      }

      const emails =
        shouldEmail && driveLink
          ? [{ action: 'gallery_link' as const, booking: updatedBooking, driveLink }]
          : []

      const { saved, emailErrors } = await runAdminTransaction(updatedBooking, emails)

      setSelectedBooking(saved)
      setEditDriveLink(saved.driveLink || '')
      setEditContactName(saved.customerName)
      setEditContactEmail(
        isPlaceholderCustomerEmail(saved.customerEmail) ? '' : saved.customerEmail,
      )
      setShowCompleteModal(false)
      fetchBookings(true)

      const emailMsg = formatEmailResult(emailErrors)
      if (emailMsg) {
        toast.warning('Saved — email issue', emailMsg)
      } else if (shouldEmail && driveLink) {
        toast.success(
          galleryOnly || alreadyCompleted ? 'Gallery emailed' : 'Session completed',
          `${saved.id} · gallery emailed to ${saved.customerEmail}.`,
        )
      } else {
        toast.success(
          alreadyCompleted ? 'Gallery link saved' : 'Session completed',
          alreadyCompleted
            ? `${saved.id} Drive link updated (no email sent).`
            : `${saved.id} marked complete (no gallery email sent).`,
        )
      }
    } catch (err) {
      console.error(err)
      toast.error('Complete failed', err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setSaveLoading(false)
    }
  }

  const getStatusBadgeClass = bookingStatusBadge
  const getPaymentBadgeClass = paymentStatusBadge

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
        title="Booking Management"
        subtitle="Search, filter, edit, reschedule, or cancel client portrait appointments."
        onRefresh={() => fetchBookings()}
        refreshing={refreshing}
      >
        <button
          type="button"
          onClick={() => setShowWalkIn((v) => !v)}
          className="bg-primary text-white px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider hover:bg-[#03008F] transition-colors"
        >
          {showWalkIn ? 'Close Walk-in' : '+ Walk-in Booking'}
        </button>
      </AdminPageHeader>

      {showWalkIn && (
        <div className={`${adminPanel} p-5 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300`}>
          <h2 className="text-xs font-bold uppercase tracking-wider text-white/70 mb-4">In-Studio Walk-in</h2>
          <form onSubmit={handleWalkInSubmit} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <input required value={walkInName} onChange={(e) => setWalkInName(e.target.value)} placeholder="Client name" className={adminInput} />
            <input required value={walkInPhone} onChange={(e) => setWalkInPhone(e.target.value)} placeholder="Phone" className={adminInput} />
            <input required type="date" value={walkInDate} onChange={(e) => setWalkInDate(e.target.value)} className={adminInput} />
            <div className="sm:col-span-2 lg:col-span-4 space-y-2">
              <span className={adminLabel}>Package category</span>
              <div className="flex flex-wrap gap-2">
                {(['graduation', 'capping-pinning', 'self-portrait', 'creative'] as BookingPackageCategory[]).map((category) => {
                  const count = walkInPackages.filter((pkg) => pkg.category === category).length
                  if (count === 0) return null
                  return (
                    <button
                      key={category}
                      type="button"
                      onClick={() => {
                        setWalkInCategory(category)
                        setWalkInSlotId('')
                      }}
                      className={`px-3 py-2 text-[10px] font-bold uppercase tracking-wider border transition-colors ${
                        walkInCategory === category
                          ? 'border-primary bg-primary text-white'
                          : 'border-white/15 text-white/60 hover:border-white/30 hover:text-white'
                      }`}
                    >
                      {BOOKING_PACKAGE_CATEGORY_LABELS[category]} ({count})
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="sm:col-span-2 lg:col-span-4 space-y-1.5">
              <span className={adminLabel}>Package</span>
              <select
                value={walkInPackage}
                onChange={(e) => {
                  setWalkInPackage(e.target.value)
                  setWalkInSlotId('')
                }}
                className={adminSelect}
              >
                {walkInPackagesInCategory.length === 0 ? (
                  <option value="">No walk-in packages in this category</option>
                ) : (
                  walkInPackagesInCategory.map((pkg) => (
                    <option key={pkg.id} value={pkg.id}>
                      {pkg.title} — {pkg.price}
                      {pkg.slotType === 'makeup' ? ' · pick slot' : ''}
                    </option>
                  ))
                )}
              </select>
            </div>
            {walkInNeedsSlot && (
              <div className="sm:col-span-2 lg:col-span-4 space-y-1.5">
                <span className={adminLabel}>Makeup session slot</span>
                <select
                  required
                  value={walkInSlotId}
                  onChange={(e) => setWalkInSlotId(e.target.value)}
                  className={adminSelect}
                >
                  <option value="">Select makeup session slot</option>
                  {MANA_SESSION_BLOCKS.map((block) => (
                    <optgroup key={block.sessionId} label={block.timeLabel}>
                      {block.slots.map((slot) => (
                        <option key={slot.id} value={slot.id}>
                          {slot.slotLabel} · arrive {slot.arrivalTime}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            )}
            <div className="sm:col-span-2 lg:col-span-4 space-y-1.5">
              <span className={adminLabel}>Deposit receipt (optional)</span>
              <label className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-white/20 bg-white/[0.03] px-3 py-3 cursor-pointer hover:border-white/35 transition-colors">
                <Upload className="w-4 h-4 text-[#C4CEFF] shrink-0" />
                <span className="text-xs text-white/70 min-w-0 truncate">
                  {walkInReceiptFile
                    ? walkInReceiptFile.name
                    : 'Upload BPI / cash deposit receipt (JPG, PNG, WEBP, PDF)'}
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
                  className="sr-only"
                  onChange={(e) => setWalkInReceiptFile(e.target.files?.[0] ?? null)}
                />
                {walkInReceiptFile && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault()
                      setWalkInReceiptFile(null)
                    }}
                    className="ml-auto text-[10px] font-bold uppercase tracking-wider text-white/45 hover:text-white"
                  >
                    Clear
                  </button>
                )}
              </label>
            </div>
            <button type="submit" disabled={walkInSaving} className={`${adminBtnPrimary} p-3 sm:col-span-2 lg:col-span-4 disabled:cursor-not-allowed active:scale-95 transition-transform`}>
              {walkInSaving ? 'Saving...' : 'Save Walk-in'}
            </button>
          </form>
        </div>
      )}

      {/* FILTER BAR */}
      <div className="border border-white/10 bg-[#222222] p-5 shadow-sm space-y-4">
        {/* Search & Date */}
        <div className="grid md:grid-cols-12 gap-4">
          <div className="md:col-span-8 relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search FM-123456, GCash ref, name, email, phone..."
              className={`${adminInput} pl-11`}
            />
          </div>
          <div className="md:col-span-4 relative">
            <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 pointer-events-none" />
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className={`${adminInput} pl-11`}
            />
          </div>
        </div>

        {/* Dropdowns */}
        <div className="grid sm:grid-cols-3 gap-4 border-t border-white/10 pt-4 flex-wrap">
          {/* Status */}
          <div className="space-y-1.5">
            <span className="text-[9px] font-bold tracking-widest text-white/40 uppercase">Booking Status</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={adminSelect}
            >
              <option value="All">All Statuses</option>
              <option value="Confirmed">Confirmed</option>
              <option value="Pending Verification">Pending Verification</option>
              <option value="Pending Payment">Pending Payment</option>
              <option value="Rejected">Rejected</option>
              <option value="Completed">Completed</option>
              <option value="Cancelled">Cancelled</option>
              <option value="No Show">No Show</option>
            </select>
          </div>

          {/* Payment */}
          <div className="space-y-1.5">
            <span className="text-[9px] font-bold tracking-widest text-white/40 uppercase">Payment Status</span>
            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
              className={adminSelect}
            >
              <option value="All">All Payments</option>
              <option value="Unpaid">Unpaid</option>
              <option value="Pending Verification">Pending Verification</option>
              <option value="Paid Deposit">Paid Deposit</option>
              <option value="Paid Full">Paid Full</option>
              <option value="Refunded">Refunded</option>
            </select>
          </div>

          {/* Package */}
          <div className="space-y-1.5">
            <span className="text-[9px] font-bold tracking-widest text-white/40 uppercase">Package Type</span>
            <select
              value={packageFilter}
              onChange={(e) => setPackageFilter(e.target.value)}
              className={adminSelect}
            >
              <option value="All">All Packages</option>
              {allPackages.map((pkg) => (
                <option key={pkg.id} value={pkg.id}>{pkg.title}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
          <p className="text-[11px] text-white/45">
            Showing <span className="font-semibold text-white/70">{filteredBookings.length}</span> of{' '}
            <span className="font-semibold text-white/70">{bookings.length}</span> bookings
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-[10px] font-bold uppercase tracking-wider text-primary hover:underline"
            >
              Clear all filters
            </button>
          )}
        </div>
      </div>

      {/* TABLE */}
      <div className="border border-white/10 bg-white/[0.02] overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[1100px]">
          <thead>
            <tr className="bg-white/[0.03] border-b border-white/10 text-[10px] font-bold tracking-widest text-white/40 uppercase">
              <th className="p-4 pl-6">Client</th>
              <th className="p-4">Reference</th>
              <th className="p-4">Customer</th>
              <th className="p-4">Package</th>
              <th className="p-4">Date & Time</th>
              <th className="p-4 text-right">Price</th>
              <th className="p-4 text-right">Deposit</th>
              <th className="p-4">Payment</th>
              <th className="p-4">Status</th>
              <th className="p-4 pr-6 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 text-xs">
            {filteredBookings.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-12 text-center text-white/45 font-semibold">
                  No bookings matching current search criteria.
                </td>
              </tr>
            ) : (
              filteredBookings.map((b) => (
                <tr key={b.id} className="hover:bg-white/[0.03]/50 transition-colors">
                  <td className="p-4 pl-6">
                    <BookingPrioritySelect
                      priority={dayPriorityMap.get(b.id) ?? null}
                      maxPriority={getDayPriorityCount(bookings, b.bookingDate)}
                    />
                  </td>
                  <td className="p-4 font-mono font-bold text-primary">{b.id}</td>
                  <td className="p-4">
                    <div className="font-semibold text-white">{b.customerName}</div>
                    <div className="text-[10px] text-white/45 mt-0.5">{b.customerEmail}</div>
                  </td>
                  <td className="p-4 font-semibold text-white/90">{b.packageName}</td>
                  <td className="p-4">
                    <div>{b.bookingDate}</div>
                    <div className="text-[10px] text-white/45 font-mono mt-0.5">{b.bookingTime.split(' - ')[0]}</div>
                  </td>
                  <td className="p-4 text-right font-bold">₱{b.price.toFixed(2)}</td>
                  <td className="p-4 text-right text-white/50">₱{b.depositAmount.toFixed(2)}</td>
                  <td className="p-4">
                    <span className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded ${getPaymentBadgeClass(b.paymentStatus)}`}>
                      {b.paymentStatus}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded ${getStatusBadgeClass(b.bookingStatus)}`}>
                      {b.bookingStatus}
                    </span>
                  </td>
                  <td className="p-4 pr-6 text-center">
                    <div className="inline-flex items-center gap-1">
                      <button
                        onClick={() => handleOpenDetails(b)}
                        className="p-1.5 hover:bg-primary/5 rounded-full text-white/50 hover:text-primary transition-colors inline-flex"
                        title="View details & Manage"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => openDeleteModal(b)}
                        className="p-1.5 hover:bg-red-500/10 rounded-full text-white/40 hover:text-red-400 transition-colors inline-flex"
                        title="Delete booking"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 3. CUSTOMER DETAILS DRAWER / MODAL */}
      {selectedBooking && (
        <div className={`${adminOverlay} justify-end`}>
          <div className={adminDrawer}>
            {/* Header */}
            <div className="p-6 border-b border-white/10 flex justify-between items-start bg-white/[0.03]">
              <div>
                <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Customer Details</span>
                <h3 className="text-base font-bold text-white mt-1">{selectedBooking.customerName}</h3>
                <p className="text-[10px] font-mono text-white/40 mt-0.5">Ref: {selectedBooking.id}</p>
              </div>
              <button
                onClick={() => setSelectedBooking(null)}
                className="p-1.5 hover:bg-white/10 rounded text-white/40 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Contact Info Card */}
              <div className="border border-white/10 p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-white/10 pb-1.5 gap-2">
                  <h4 className="text-[10px] font-bold tracking-widest text-white/40 uppercase">
                    Contact Information
                  </h4>
                  {!editingContact ? (
                    <button
                      type="button"
                      onClick={() => setEditingContact(true)}
                      className="text-[10px] text-primary font-bold uppercase tracking-wider hover:underline"
                    >
                      Edit contact
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingContact(false)
                        setEditContactName(selectedBooking.customerName || '')
                        setEditContactEmail(
                          isPlaceholderCustomerEmail(selectedBooking.customerEmail)
                            ? ''
                            : selectedBooking.customerEmail || '',
                        )
                        setEditContactPhone(
                          !selectedBooking.customerPhone || selectedBooking.customerPhone === '0000000000'
                            ? ''
                            : selectedBooking.customerPhone,
                        )
                      }}
                      className="text-[10px] text-red-400 font-bold uppercase tracking-wider hover:underline"
                    >
                      Cancel
                    </button>
                  )}
                </div>

                {editingContact ? (
                  <div className="space-y-3">
                    {isPlaceholderCustomerEmail(selectedBooking.customerEmail) && (
                      <p className="text-[11px] text-amber-300/90 leading-relaxed border border-amber-500/20 bg-amber-500/10 p-2.5">
                        This booking has no real email yet (imported). Add name + email so you can send the
                        raw gallery Drive link to the client.
                      </p>
                    )}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-white/45 uppercase">Full Name</label>
                      <input
                        value={editContactName}
                        onChange={(e) => setEditContactName(e.target.value)}
                        className="w-full bg-black/40 border border-white/10 p-2 text-xs font-semibold focus:border-primary focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-white/45 uppercase">Email</label>
                      <input
                        type="email"
                        value={editContactEmail}
                        onChange={(e) => setEditContactEmail(e.target.value)}
                        placeholder="client@email.com"
                        className="w-full bg-black/40 border border-white/10 p-2 text-xs font-semibold focus:border-primary focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-white/45 uppercase">Phone (optional)</label>
                      <input
                        value={editContactPhone}
                        onChange={(e) => setEditContactPhone(e.target.value)}
                        placeholder="09XXXXXXXXX"
                        className="w-full bg-black/40 border border-white/10 p-2 text-xs font-semibold focus:border-primary focus:outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={saveLoading}
                      onClick={handleSaveContact}
                      className="bg-primary text-white text-[10px] font-bold uppercase tracking-wider px-4 py-2.5 hover:bg-[#03008F] disabled:opacity-50"
                    >
                      Save Contact
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-xs">
                    <div className="min-w-0 sm:col-span-2">
                      <p className="text-white/40 font-medium">Full Name</p>
                      <p className="font-semibold mt-0.5 break-words">{selectedBooking.customerName}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-white/40 font-medium">Email Address</p>
                      <p className="font-semibold mt-0.5 break-all">
                        {isPlaceholderCustomerEmail(selectedBooking.customerEmail)
                          ? <span className="text-amber-300">No email on file</span>
                          : selectedBooking.customerEmail}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-white/40 font-medium">Phone Number</p>
                      <p className="font-semibold mt-0.5 break-words">
                        {!selectedBooking.customerPhone || selectedBooking.customerPhone === '0000000000'
                          ? <span className="text-white/45">N/A</span>
                          : selectedBooking.customerPhone}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-white/40 font-medium">Facebook Name</p>
                      <p className="font-semibold mt-0.5 break-words">{selectedBooking.customerFbName || 'N/A'}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-white/40 font-medium">Facebook Profile</p>
                      {selectedBooking.customerFbLink ? (
                        <a
                          href={selectedBooking.customerFbLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline font-bold mt-0.5 inline-flex items-center gap-1.5 break-all"
                        >
                          View Profile <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
                        </a>
                      ) : (
                        <p className="text-white/50 italic mt-0.5">No link provided</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Booking Info Card */}
              <form onSubmit={handleSaveDetails} className="border border-white/10 p-4 space-y-4">
                <div className="flex justify-between items-center border-b border-white/10 pb-1.5">
                  <h4 className="text-[10px] font-bold tracking-widest text-white/40 uppercase">
                    Session & Schedule Details
                  </h4>
                  {!isEditing ? (
                    <button
                      type="button"
                      onClick={() => setIsEditing(true)}
                      className="text-[10px] text-primary font-bold uppercase tracking-wider hover:underline flex items-center gap-1"
                    >
                      <Edit className="w-3 h-3" /> Reschedule
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsEditing(false)}
                      className="text-[10px] text-red-500 font-bold uppercase tracking-wider hover:underline"
                    >
                      Cancel Edit
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-y-4 text-xs">
                  <div>
                    <p className="text-white/40 font-medium">Package</p>
                    <p className="font-semibold text-primary mt-0.5">{selectedBooking.packageName}</p>
                  </div>
                  <div>
                    <p className="text-white/40 font-medium">Price / Balance</p>
                    <p className="font-semibold mt-0.5">
                      ₱{selectedBooking.price.toFixed(2)} / <span className="text-white/40">Bal: ₱{(selectedBooking.price - selectedBooking.depositAmount).toFixed(2)}</span>
                    </p>
                  </div>
                  
                  {isEditing ? (
                    <>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-white/45 uppercase">Date</label>
                        <input
                          type="date"
                          required
                          value={editDate}
                          onChange={(e) => setEditDate(e.target.value)}
                          className="w-full bg-black/40 border border-white/10 p-2 text-xs font-semibold focus:border-primary focus:outline-none"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-white/45 uppercase">Time Slot</label>
                        <select
                          value={editTime}
                          onChange={(e) => setEditTime(e.target.value)}
                          className="w-full bg-black/40 border border-white/10 p-2 text-xs font-semibold focus:border-primary focus:outline-none"
                        >
                          {(usesMakeupSlots(selectedBooking.packageId)
                            ? ALL_MANA_SLOTS.map((slot) => formatSlotBookingTime(slot))
                            : [FICO_BOOKING_TIME_LABEL]
                          ).map((slot) => (
                            <option key={slot} value={slot}>{slot}</option>
                          ))}
                        </select>
                      </div>
                      
                      <div className="col-span-2 flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 p-2.5">
                        <input
                          id="chargeFee"
                          type="checkbox"
                          checked={chargeRebookingFee}
                          onChange={(e) => setChargeRebookingFee(e.target.checked)}
                          className="w-3.5 h-3.5 text-primary border-white/20 focus:ring-primary"
                        />
                        <label htmlFor="chargeFee" className="text-[10px] font-semibold text-amber-300 uppercase tracking-wide cursor-pointer select-none">
                          Apply ₱500.00 Rebooking Fee (Reschedule charges)
                        </label>
                      </div>

                      <div className="col-span-2 space-y-1.5">
                        <label htmlFor="editDrive" className="text-[10px] font-bold text-white/45 uppercase">Google Drive Gallery Link</label>
                        <input
                          id="editDrive"
                          type="url"
                          value={editDriveLink}
                          onChange={(e) => setEditDriveLink(e.target.value)}
                          placeholder="https://drive.google.com/drive/folders/..."
                          className="w-full bg-black/40 border border-white/10 p-2 text-xs font-semibold focus:border-primary focus:outline-none"
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <p className="text-white/40 font-medium mb-1.5">Client #</p>
                        <BookingPrioritySelect
                          priority={dayPriorityMap.get(selectedBooking.id) ?? null}
                          maxPriority={getDayPriorityCount(bookings, selectedBooking.bookingDate)}
                        />
                      </div>
                      <div>
                        <p className="text-white/40 font-medium">Appointment Time</p>
                        <p className="font-semibold text-white/90 mt-0.5">
                          {selectedBooking.bookingDate} at {selectedBooking.bookingTime}
                        </p>
                      </div>
                      {selectedBooking.driveLink && (
                        <div className="col-span-2 border-t border-white/10 pt-2 mt-1">
                          <p className="text-white/40 font-medium">Google Drive Gallery Link</p>
                          <a 
                            href={selectedBooking.driveLink} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="text-green-400 font-semibold hover:underline mt-0.5 flex items-center gap-1 text-[11px]"
                          >
                            Open Drive Gallery <ArrowUpRight className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      )}
                    </>
                  )}

                  <div className="col-span-2">
                    <AdminBookingRawPhoto booking={selectedBooking} />
                  </div>

                  <GraduationSessionDetails booking={selectedBooking} />

                  {selectedBooking.note && (
                    <div className="col-span-2">
                      <p className="text-white/40 font-medium mb-1">Pre-Shoot Request Note</p>
                      <p className="bg-white/[0.03] p-2 border border-white/10 rounded leading-relaxed text-[11px] italic">
                        "{selectedBooking.note}"
                      </p>
                    </div>
                  )}

                  {/* Staff Notes input */}
                  <div className="col-span-2 space-y-1.5">
                    <label htmlFor="staffNotes" className="text-[10px] font-bold text-white/45 uppercase">
                      Internal Staff Notes
                    </label>
                    <textarea
                      id="staffNotes"
                      rows={3}
                      value={editStaffNotes}
                      onChange={(e) => setEditStaffNotes(e.target.value)}
                      placeholder="Add private staff notes, backdrop choices, or check-in records here..."
                      className="w-full bg-black/40 border border-white/10 p-2.5 text-xs font-semibold focus:border-primary focus:outline-none resize-none leading-relaxed"
                    />
                    <button
                      type="button"
                      onClick={handleSaveStaffNotes}
                      disabled={saveLoading}
                      className="text-[10px] font-bold uppercase tracking-wider text-primary hover:underline"
                    >
                      Save staff notes
                    </button>
                  </div>

                  {isEditing && (
                    <div className="col-span-2 flex justify-end">
                      <button
                        type="submit"
                        disabled={saveLoading}
                        className="bg-primary text-white text-xs font-bold uppercase tracking-wider px-5 py-2.5 hover:bg-[#03008F] flex items-center gap-1.5"
                      >
                        <Save className="w-3.5 h-3.5" /> Save Changes
                      </button>
                    </div>
                  )}
                </div>
            </form>

            {/* Payment History Ledger */}
            <div className="border border-white/10 p-4 space-y-3">
              <h4 className="text-[10px] font-bold tracking-widest text-white/40 uppercase border-b border-white/10 pb-1.5">
                Payment History Ledger
              </h4>
              {(selectedBooking.paymentHistory || []).length === 0 ? (
                <p className="text-xs text-white/40">No transactions recorded.</p>
              ) : (
                <div className="space-y-2 text-xs">
                  {(selectedBooking.paymentHistory || []).map((pay) => (
                    <div key={pay.id} className="flex justify-between items-start gap-3 bg-white/[0.03] p-2.5 border border-white/10">
                      <div>
                        <p className="font-semibold text-white/90">{pay.type}</p>
                        <p className="text-[9px] text-white/40 font-mono mt-0.5">{new Date(pay.date).toLocaleDateString()} via {pay.method}</p>
                        {pay.transactionRef && (
                          <p className="text-[9px] text-white/40 font-mono mt-0.5">Ref: {pay.transactionRef}</p>
                        )}
                      </div>
                      <AdminReceiptActions
                        booking={selectedBooking}
                        payment={pay}
                        disabled={saveLoading}
                        onResult={(success, message) => {
                          if (success) toast.success('Receipt sent', message)
                          else toast.error('Receipt action failed', message)
                        }}
                      />
                    </div>
                  ))}
                  <div className="border-t border-white/10 pt-2 flex justify-between items-center font-bold text-xs">
                    <span>Total Paid:</span>
                    <span className="text-green-400">₱{(selectedBooking.paymentHistory || []).reduce((acc, p) => acc + p.amount, 0).toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Record Studio Payment Form */}
            {(() => {
              const paidSum = (selectedBooking.paymentHistory || []).reduce((acc, pay) => acc + pay.amount, 0)
              const outstanding = selectedBooking.price - paidSum
              
              if (outstanding <= 0 || selectedBooking.bookingStatus === 'Cancelled') return null
              
              return (
                <form onSubmit={handleRecordStudioPayment} className="border border-white/10 p-4 space-y-4">
                  <h4 className="text-[10px] font-bold tracking-widest text-white/40 uppercase border-b border-white/10 pb-1.5">
                    Record Studio Payment
                  </h4>
                  
                  <div className="bg-amber-500/10 border border-amber-500/30 p-3 text-[11px] text-amber-300">
                    Outstanding Balance: <strong className="text-sm font-bold text-amber-400">₱{outstanding.toFixed(2)}</strong>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-white/45 uppercase">Payment Method</label>
                      <select
                        value={studioPayMethod}
                        onChange={(e) => setStudioPayMethod(e.target.value as any)}
                        className="w-full bg-black/40 border border-white/10 p-2 text-xs font-semibold focus:border-primary focus:outline-none"
                      >
                        <option value="Cash">Cash</option>
                        <option value="GCash">GCash</option>
                        <option value="Card">Card</option>
                        <option value="Maya">Maya</option>
                        <option value="Bank Transfer">Bank Transfer</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-white/45 uppercase">Amount Received</label>
                      <input
                        type="number"
                        required
                        min={1}
                        max={outstanding}
                        value={studioPayAmount}
                        onChange={(e) => setStudioPayAmount(parseFloat(e.target.value) || 0)}
                        className="w-full bg-black/40 border border-white/10 p-2 text-xs font-semibold focus:border-primary focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <label className="text-[10px] font-bold text-white/45 uppercase">Transaction Reference (Optional)</label>
                    <input
                      type="text"
                      value={studioPayRef}
                      onChange={(e) => setStudioPayRef(e.target.value)}
                      placeholder="e.g. GCash Ref / Card Slip Code"
                      className="w-full bg-black/40 border border-white/10 p-2 text-xs font-semibold focus:border-primary focus:outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={saveLoading}
                    className="w-full bg-primary text-white text-[10px] font-bold uppercase tracking-wider py-3 hover:bg-[#03008F]"
                  >
                    Record In-Studio Payment
                  </button>
                </form>
              )
            })()}

            {/* Receipt Preview if exists */}
              {selectedBooking.receiptUrl && (
                <div className="border border-white/10 p-4 space-y-3">
                  <h4 className="text-[10px] font-bold tracking-widest text-white/40 uppercase border-b border-white/10 pb-1.5">
                    Uploaded GCash Receipt
                  </h4>
                  <div className="flex gap-4 items-center">
                    <div className="w-20 h-20 bg-white/[0.05] border border-white/10 relative overflow-hidden flex-shrink-0">
                      {selectedBooking.receiptUrl.endsWith('.pdf') ? (
                        <div className="w-full h-full flex items-center justify-center text-white/50">
                          <FileText className="w-8 h-8" />
                        </div>
                      ) : (
                        <Image
                          src={selectedBooking.receiptUrl}
                          alt="Receipt thumbnail"
                          fill
                          className="object-cover"
                        />
                      )}
                    </div>
                    <div className="space-y-1 text-xs">
                      <p className="font-semibold text-white/90">GCash Deposit Verification</p>
                      <p className="font-mono text-[10px] text-white/45">Ref: {selectedBooking.transactionRef || 'N/A'}</p>
                      <a
                        href={selectedBooking.receiptUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[10px] text-primary font-bold hover:underline"
                      >
                        View Full Screen <ArrowUpRight className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Actions Panel */}
            <div className="p-6 bg-white/[0.03] border-t border-white/10 space-y-3">
              <h4 className="text-[10px] font-bold tracking-widest text-white/40 uppercase">
                Quick Actions
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => handleSendShootReminder(selectedBooking)}
                  disabled={
                    selectedBooking.bookingStatus === 'Cancelled' ||
                    selectedBooking.bookingStatus === 'Completed' ||
                    selectedBooking.bookingStatus === 'No Show' ||
                    saveLoading ||
                    isPlaceholderCustomerEmail(selectedBooking.customerEmail)
                  }
                  className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2.5 uppercase tracking-wider flex items-center justify-center gap-1 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 col-span-2 sm:col-span-3"
                >
                  <Bell className="w-3.5 h-3.5" /> Send Shoot Reminder
                </button>
                <button
                  type="button"
                  onClick={() => openGalleryLinkModal(selectedBooking, 'gallery')}
                  disabled={selectedBooking.bookingStatus === 'Cancelled' || saveLoading}
                  className="bg-primary hover:bg-[#03008F] text-white font-bold py-2.5 uppercase tracking-wider flex items-center justify-center gap-1 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 col-span-2 sm:col-span-3"
                >
                  <Link2 className="w-3.5 h-3.5" /> Send Google Drive Link
                </button>
                <button
                  type="button"
                  onClick={() => handleUpdateStatus(selectedBooking, 'Completed')}
                  disabled={
                    selectedBooking.bookingStatus === 'Completed' ||
                    selectedBooking.bookingStatus === 'Cancelled' ||
                    saveLoading
                  }
                  className="bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 uppercase tracking-wider flex items-center justify-center gap-1 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                >
                  <CheckCircle className="w-3.5 h-3.5" /> Complete
                </button>
                <button
                  type="button"
                  onClick={() => handleUpdateStatus(selectedBooking, 'No Show')}
                  disabled={selectedBooking.bookingStatus === 'No Show' || selectedBooking.bookingStatus === 'Cancelled' || saveLoading}
                  className="bg-white/10 hover:bg-white/20 text-white font-bold py-2.5 uppercase tracking-wider flex items-center justify-center gap-1 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                >
                  <Clock className="w-3.5 h-3.5" /> No Show
                </button>
                <button
                  type="button"
                  onClick={() => handleUpdateStatus(selectedBooking, 'Cancelled')}
                  disabled={selectedBooking.bookingStatus === 'Cancelled' || selectedBooking.bookingStatus === 'Completed' || saveLoading}
                  className="bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 uppercase tracking-wider flex items-center justify-center gap-1 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                >
                  <XCircle className="w-3.5 h-3.5" /> Cancel
                </button>
                <button
                  type="button"
                  onClick={() => openDeleteModal(selectedBooking)}
                  disabled={saveLoading || deleteLoading}
                  className="bg-red-950/80 hover:bg-red-900 border border-red-500/40 text-red-200 font-bold py-2.5 uppercase tracking-wider flex items-center justify-center gap-1 transition-all disabled:opacity-50 disabled:cursor-not-allowed col-span-2 sm:col-span-3"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete booking
                </button>
              </div>
              <p className="text-[10px] text-white/35">
                Use <strong className="text-white/55">Send Shoot Reminder</strong> on the morning of the session (email says “today”).
                Use <strong className="text-white/55">Send Google Drive Link</strong> anytime after payment to email the raw gallery. Cancel keeps the record; Delete permanently removes it.
              </p>
            </div>
          </div>
        </div>
      )}
      {/* Complete + Gallery Link Modal */}
      {showCompleteModal && selectedBooking && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="border border-white/10 bg-[#222222] shadow-2xl max-w-md w-full p-6 md:p-8 space-y-5">
            <div className="flex justify-between items-start border-b border-white/10 pb-3">
              <div>
                <h3 className="font-bold text-white text-lg">
                  {completeModalMode === 'gallery' ? 'Send Google Drive Link' : 'Complete Session'}
                </h3>
                <p className="text-[10px] text-white/40 font-mono mt-0.5">{selectedBooking.id}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowCompleteModal(false)}
                className="p-1 hover:bg-white/[0.05] rounded text-white/40"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-white/60 leading-relaxed">
              {completeModalMode === 'gallery'
                ? 'Paste the Google Drive raw gallery folder, confirm name + email, then send it to the client. Works even if payment was already recorded.'
                : "Paste the Google Drive folder of this client's raw gallery. Confirm name + email so we can email them the link and the page to submit their 5 chosen photos."}
            </p>

            <div className="space-y-2">
              <label htmlFor="completeName" className="text-[10px] font-bold tracking-widest text-white/45 uppercase">
                Client Full Name
              </label>
              <input
                id="completeName"
                value={completeClientName}
                onChange={(e) => setCompleteClientName(e.target.value)}
                placeholder="Full name"
                className="w-full bg-black/40 border border-white/10 p-3 text-xs font-semibold focus:border-primary focus:outline-none text-white"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="completeEmail" className="text-[10px] font-bold tracking-widest text-white/45 uppercase">
                Client Email
              </label>
              <input
                id="completeEmail"
                type="email"
                value={completeClientEmail}
                onChange={(e) => setCompleteClientEmail(e.target.value)}
                placeholder="client@email.com"
                className="w-full bg-black/40 border border-white/10 p-3 text-xs font-semibold focus:border-primary focus:outline-none text-white"
              />
              <p className="text-[10px] text-white/40">
                Required to email the raw gallery. Saved on the booking for filtering / editor later.
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="completeDrive" className="text-[10px] font-bold tracking-widest text-white/45 uppercase">
                Google Drive Gallery Link (raw files)
              </label>
              <input
                id="completeDrive"
                type="url"
                value={completeDriveLink}
                onChange={(e) => setCompleteDriveLink(e.target.value)}
                placeholder="https://drive.google.com/drive/folders/..."
                className="w-full bg-black/40 border border-white/10 p-3 text-xs font-semibold focus:border-primary focus:outline-none text-white"
              />
              <p className="text-[10px] text-white/40">
                Share the folder as <strong className="text-white/60">Anyone with the link</strong> (Viewer).
              </p>
            </div>

            {completeModalMode === 'complete' && (
              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={completeSendEmail}
                  onChange={(e) => setCompleteSendEmail(e.target.checked)}
                  className="mt-0.5 w-3.5 h-3.5 text-primary border-white/20"
                />
                <span className="text-[11px] text-white/70 leading-snug">
                  Email gallery link + submit page to the client email above
                </span>
              </label>
            )}

            <div className="flex flex-col gap-2 border-t border-white/10 pt-4">
              <button
                type="button"
                disabled={saveLoading}
                onClick={() =>
                  handleConfirmComplete({
                    sendEmail: completeModalMode === 'gallery' ? true : completeSendEmail,
                  })
                }
                className="w-full bg-green-600 hover:bg-green-700 text-white text-xs font-bold uppercase tracking-wider py-3 disabled:opacity-50"
              >
                {completeModalMode === 'gallery'
                  ? 'Save & Email Drive Link'
                  : completeSendEmail
                    ? 'Complete & Email Client'
                    : 'Complete Session'}
              </button>
              {completeModalMode === 'complete' && completeSendEmail && (
                <button
                  type="button"
                  disabled={saveLoading}
                  onClick={() => handleConfirmComplete({ sendEmail: false })}
                  className="w-full border border-white/10 text-white/70 hover:text-white hover:bg-white/[0.04] text-[10px] font-bold uppercase tracking-wider py-2.5 disabled:opacity-50"
                >
                  Complete without email
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowCompleteModal(false)}
                className="w-full text-white/40 hover:text-white/70 text-[10px] font-bold uppercase tracking-wider py-2"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && deleteTarget && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="border border-red-500/30 bg-[#222222] shadow-2xl max-w-md w-full p-6 md:p-8 space-y-5">
            <div className="flex justify-between items-start border-b border-white/10 pb-3">
              <div>
                <h3 className="font-bold text-white text-lg">Delete booking</h3>
                <p className="text-[10px] text-white/40 font-mono mt-0.5">{deleteTarget.id}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowDeleteModal(false)
                  setDeleteTarget(null)
                }}
                className="p-1 hover:bg-white/[0.05] rounded text-white/40"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-white/70 leading-relaxed">
              Permanently remove <span className="text-white font-semibold">{deleteTarget.customerName}</span>
              {' '}({deleteTarget.bookingDate}). This cannot be undone. Prefer Cancel if you only need to free the slot.
            </p>

            <div className="space-y-2">
              <p className="text-[10px] font-bold tracking-widest text-white/45 uppercase">Reason</p>
              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteReason('admin_error')}
                  className={`text-left px-3 py-2.5 border text-xs transition-colors ${
                    deleteReason === 'admin_error'
                      ? 'border-primary/50 bg-primary/15 text-white'
                      : 'border-white/10 text-white/60 hover:border-white/25'
                  }`}
                >
                  <span className="font-bold uppercase tracking-wider text-[10px]">Admin error</span>
                  <span className="block text-[11px] text-white/45 mt-0.5">Wrong slot, duplicate entry, staff mistake</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteReason('client_error')}
                  className={`text-left px-3 py-2.5 border text-xs transition-colors ${
                    deleteReason === 'client_error'
                      ? 'border-primary/50 bg-primary/15 text-white'
                      : 'border-white/10 text-white/60 hover:border-white/25'
                  }`}
                >
                  <span className="font-bold uppercase tracking-wider text-[10px]">Client error</span>
                  <span className="block text-[11px] text-white/45 mt-0.5">Wrong details, client asked to remove, spam</span>
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold tracking-widest text-white/45 uppercase">
                Notes (optional)
              </label>
              <input
                value={deleteNotes}
                onChange={(e) => setDeleteNotes(e.target.value)}
                placeholder="Short note for your records…"
                className={adminInput}
              />
            </div>

            <div className="space-y-2 pt-1">
              <button
                type="button"
                disabled={deleteLoading}
                onClick={handleDeleteBooking}
                className="w-full bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold uppercase tracking-wider py-3 disabled:opacity-50"
              >
                {deleteLoading ? 'Deleting…' : 'Delete permanently'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDeleteModal(false)
                  setDeleteTarget(null)
                }}
                className="w-full text-white/40 hover:text-white/70 text-[10px] font-bold uppercase tracking-wider py-2"
              >
                Keep booking
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
