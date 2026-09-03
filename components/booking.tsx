'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { User, Users, GraduationCap, ChevronLeft, ChevronRight, ChevronDown, Check, RefreshCw, Upload, Copy, ArrowRight } from 'lucide-react'
import SectionHeader from '@/components/section-header'
import SectionShell from '@/components/section-shell'
import BookingSlotPicker from '@/components/booking-slot-picker'
import BookingGraduationPreview from '@/components/booking-graduation-preview'
import BookingSummarySidebar from '@/components/booking-summary'
import BpiQrDisplay from '@/components/bpi-qr-display'
import { saveBooking, uploadReceipt, getBookingsForAvailability, getBooking, getBookingPackages, getBlockedSlots, getFicoSpotBlocks } from '@/lib/data-store'
import { getBlockedSlot, type BlockedSlot } from '@/lib/blocked-slots'
import { getFicoBookableLimit, getFicoSpotBlock, type FicoSpotBlock } from '@/lib/fico-spot-blocks'
import { getBookingPackage, usesMakeupSlots, parsePackagePrice, packageRequiresDeposit, type BookingPackage, type BookingPackageCategory } from '@/lib/booking-packages'
import {
  GRADUATION_TOGA_NOTE,
  HOOD_COLOR_GRID,
  STUDIO_BACKGROUNDS,
  TASSEL_COLORS,
  TOGA_COLORS,
  colorToPreviewFill,
  colorSwatchTextClass,
} from '@/lib/graduation-booking-options'
import {
  formatDateKey,
  FICO_ARRIVAL_LABEL,
  FICO_AVAILABILITY_LABEL,
  FICO_BOOKING_TIME_LABEL,
  FICO_SHOOT_TIME_LABEL,
  FICO_DAILY_LIMIT,
  formatSlotBookingTime,
  getFicoRemainingCapacity,
  getSlotById,
  isDateFullForPackage,
  isFicoDateFull,
  isMakeupSlotFull,
} from '@/lib/booking-slots'
import { generateBookingId } from '@/lib/booking-id'

function getPackageIcon(pkg: BookingPackage) {
  if (pkg.category === 'graduation' && pkg.slotType === 'makeup') return GraduationCap
  if (pkg.id.startsWith('mana') || pkg.id.startsWith('creative')) return Users
  return User
}

const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const STEP_LABELS = ['Package', 'Date & Slot', 'Details', 'Your Info', 'Deposit']

const inputClass =
  'w-full border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30'

const labelClass = 'text-[10px] font-bold tracking-[0.12em] uppercase text-white'

const cardClass = 'border border-white/10 bg-white/[0.02] backdrop-blur-sm'

const btnBackClass =
  'w-full sm:w-auto border border-white/10 px-6 py-3 text-xs uppercase text-white/70 hover:border-white/30 hover:text-white text-center'

const btnPrimaryClass =
  'w-full sm:w-auto inline-flex items-center justify-center bg-primary text-primary-foreground px-8 py-3 text-xs uppercase font-semibold disabled:opacity-40'

const stepNavClass =
  'flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between pt-4 sm:pt-6 border-t border-white/10'

function StepProgress({
  step,
  isGraduation,
  requiresDeposit,
}: {
  step: number
  isGraduation: boolean
  requiresDeposit: boolean
}) {
  const steps = isGraduation
    ? [1, 2, 3, 4, 5]
    : requiresDeposit
      ? [1, 2, 4, 5]
      : [1, 2, 4]
  const labels = isGraduation
    ? STEP_LABELS
    : requiresDeposit
      ? ['Package', 'Date & Slot', 'Your Info', 'Deposit']
      : ['Package', 'Date & Slot', 'Your Info']

  return (
    <div className="mb-6 sm:mb-10 px-1">
      <div className="flex items-center justify-center max-w-2xl mx-auto overflow-x-auto pb-1">
        {steps.map((num, i) => {
          const done = step > num
          const active = step === num
          return (
            <div key={num} className="flex items-center flex-1 min-w-[2.5rem] last:flex-none">
              <div
                className={`w-7 h-7 sm:w-9 sm:h-9 shrink-0 flex items-center justify-center text-xs sm:text-sm font-semibold border-2 transition-colors ${
                  done
                    ? 'bg-primary border-primary text-primary-foreground'
                    : active
                      ? 'bg-primary/20 border-primary text-white'
                      : 'bg-white/5 border-white/10 text-white/40'
                }`}
              >
                {done ? <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : num}
              </div>
              {i < steps.length - 1 && (
                <div className={`flex-1 h-0.5 mx-0.5 sm:mx-1 min-w-[0.5rem] ${step > num ? 'bg-primary' : 'bg-white/10'}`} />
              )}
            </div>
          )
        })}
      </div>
      <div className="hidden sm:flex justify-center gap-2 sm:gap-4 mt-3 flex-wrap px-2">
        {labels.map((l) => (
          <span key={l} className="text-[8px] sm:text-[9px] uppercase tracking-wider text-white/40">
            {l}
          </span>
        ))}
      </div>
      <p className="sm:hidden text-center text-[9px] uppercase tracking-wider text-white/50 mt-2">
        Step {steps.indexOf(step) + 1} of {steps.length}
        {steps.includes(step) && labels[steps.indexOf(step)] ? ` · ${labels[steps.indexOf(step)]}` : ''}
      </p>
    </div>
  )
}

function BookingForm() {
  const searchParams = useSearchParams()
  const [step, setStep] = useState(1)
  const [selectedSession, setSelectedSession] = useState<BookingPackage | null>(null)
  const [activeCategory, setActiveCategory] = useState<BookingPackageCategory>('graduation')
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear())
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedTimeSlot, setSelectedTimeSlot] = useState('')
  const [selectedSlotId, setSelectedSlotId] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [fbName, setFbName] = useState('')
  const [fbLink, setFbLink] = useState('')
  const [note, setNote] = useState('')
  const [schoolName, setSchoolName] = useState('')
  const [course, setCourse] = useState('')
  const [paymentMethod] = useState<'BPI'>('BPI')
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [transactionRef, setTransactionRef] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [bookingId, setBookingId] = useState('')
  const [submittedSummary, setSubmittedSummary] = useState<{
    paymentMethod: 'BPI'
    transactionRef: string
    depositAmount: number
    packageName: string
    bookingDate: string
  } | null>(null)
  const [allBookings, setAllBookings] = useState<any[]>([])
  const [blockedSlots, setBlockedSlots] = useState<BlockedSlot[]>([])
  const [ficoSpotBlocks, setFicoSpotBlocks] = useState<FicoSpotBlock[]>([])
  const [packages, setPackages] = useState<BookingPackage[]>([])
  const [packagesLoading, setPackagesLoading] = useState(true)
  const [formError, setFormError] = useState('')
  const [copiedText, setCopiedText] = useState(false)
  const [copiedRef, setCopiedRef] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const stepPanelRef = useRef<HTMLDivElement>(null)
  const prevStepRef = useRef<number | null>(null)

  useEffect(() => {
    const panel = stepPanelRef.current
    if (!panel) return

    const isFirstRun = prevStepRef.current === null
    prevStepRef.current = step

    if (isFirstRun) {
      const hash = window.location.hash
      const hasPackage = searchParams.get('package')
      if (hash !== '#booking' && !hasPackage) return
    }

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
    requestAnimationFrame(() => {
      panel.scrollIntoView({ behavior: 'auto', block: 'start' })
    })
  }, [step, searchParams])

  useEffect(() => {
    Promise.all([getBookingsForAvailability(), getBlockedSlots(), getFicoSpotBlocks()])
      .then(([bookings, blocked, ficoBlocks]) => {
        setAllBookings(bookings)
        setBlockedSlots(blocked)
        setFicoSpotBlocks(ficoBlocks)
      })
      .catch(console.error)
    getBookingPackages()
      .then(setPackages)
      .catch(console.error)
      .finally(() => setPackagesLoading(false))
  }, [])

  useEffect(() => {
    const packageId = searchParams.get('package')
    if (!packageId) return
    const pkg = getBookingPackage(packageId)
    if (!pkg) return
    setSelectedSession(pkg)
    setActiveCategory(pkg.category === 'creative' ? 'creative' : pkg.category)
    setStep(2)
  }, [searchParams])

  const isGraduationPackage = selectedSession?.category === 'graduation'
  const requiresDeposit = selectedSession
    ? packageRequiresDeposit(selectedSession.id)
    : activeCategory !== 'self-portrait'
  const isMakeupPackage = selectedSession ? usesMakeupSlots(selectedSession.id) : false
  const dateKey = selectedDate ? formatDateKey(selectedDate) : ''
  const ficoBookableLimit =
    selectedDate && !isMakeupPackage ? getFicoBookableLimit(ficoSpotBlocks, dateKey) : FICO_DAILY_LIMIT
  const ficoRemaining =
    selectedDate && !isMakeupPackage ? getFicoRemainingCapacity(allBookings, dateKey, ficoSpotBlocks) : null
  const selectedFicoHold = dateKey ? getFicoSpotBlock(ficoSpotBlocks, dateKey) : undefined
  const filteredPackages = packages.filter((p) => p.category === activeCategory)
  const isPast = (day: number) => {
    const t = new Date()
    t.setHours(0, 0, 0, 0)
    return new Date(viewYear, viewMonth, day) < t
  }
  const isSame = (day: number) =>
    selectedDate &&
    selectedDate.getDate() === day &&
    selectedDate.getMonth() === viewMonth &&
    selectedDate.getFullYear() === viewYear
  const dateKeyForDay = (day: number) =>
    formatDateKey(new Date(viewYear, viewMonth, day))
  const isDayFull = (day: number) =>
    selectedSession
      ? isDateFullForPackage(allBookings, dateKeyForDay(day), selectedSession.id, ficoSpotBlocks)
      : false
  const isSlotFull = (slotId: string) =>
    dateKey ? isMakeupSlotFull(allBookings, dateKey, slotId) : false
  const isSlotBlocked = (slotId: string) =>
    dateKey ? !!getBlockedSlot(blockedSlots, dateKey, slotId) : false
  const isSlotUnavailableForPicker = (slotId: string) =>
    isSlotFull(slotId) || isSlotBlocked(slotId)
  const canProceedDate =
    !!selectedDate &&
    (isMakeupPackage
      ? !!selectedSlotId && !isSlotBlocked(selectedSlotId) && !isSlotFull(selectedSlotId)
      : (ficoRemaining ?? 0) > 0)

  const cells: (number | null)[] = []
  const startPad = new Date(viewYear, viewMonth, 1).getDay()
  const totalDays = new Date(viewYear, viewMonth + 1, 0).getDate()
  for (let i = 0; i < startPad; i++) cells.push(null)
  for (let d = 1; d <= totalDays; d++) cells.push(d)

  const pickDate = (day: number) => {
    setSelectedDate(new Date(viewYear, viewMonth, day))
    setSelectedSlotId('')
    setSelectedTimeSlot(isMakeupPackage ? '' : FICO_BOOKING_TIME_LABEL)
  }

  const goAfterDate = () => (isGraduationPackage ? setStep(3) : setStep(4))
  const goBackFromContact = () => (isGraduationPackage ? setStep(3) : setStep(2))

  const validateGraduationStep = () => {
    if (!schoolName || !course) {
      setFormError('Please enter your school name and course.')
      return false
    }
    setFormError('')
    return true
  }

  const validateContactStep = () => {
    if (!name || !email || !phone || !fbName || !fbLink) {
      setFormError('Please fill in all required contact fields.')
      return false
    }
    setFormError('')
    return true
  }

  const graduationSummary = isGraduationPackage
    ? { schoolName, course }
    : undefined

  const submitBooking = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!selectedSession || !selectedDate || (requiresDeposit && !receiptFile) || (isMakeupPackage && !selectedSlotId)) return
    setIsSubmitting(true)
    setFormError('')
    try {
      const [latest, latestBlocked, latestFicoBlocks] = await Promise.all([
        getBookingsForAvailability(),
        getBlockedSlots(),
        getFicoSpotBlocks(),
      ])
      setBlockedSlots(latestBlocked)
      setFicoSpotBlocks(latestFicoBlocks)
      const dk = formatDateKey(selectedDate)
      if (isMakeupPackage && selectedSlotId && getBlockedSlot(latestBlocked, dk, selectedSlotId)) {
        const reason = getBlockedSlot(latestBlocked, dk, selectedSlotId)?.reason
        setFormError(reason ? `Slot unavailable: ${reason}` : 'This session slot is no longer available.')
        return
      }
      if (!isMakeupPackage && isFicoDateFull(latest, dk, latestFicoBlocks)) {
        setFormError('This date is fully booked. Please choose another date.')
        return
      }
      if (isMakeupPackage && selectedSlotId && isMakeupSlotFull(latest, dk, selectedSlotId)) {
        setFormError('This session slot is now full. Please pick another slot.')
        return
      }
      const id = generateBookingId(latest.map((b) => b.id))
      setBookingId(id)
      setSubmittedSummary({
        paymentMethod,
        transactionRef: requiresDeposit ? transactionRef.trim() : '',
        depositAmount: requiresDeposit ? 500 : 0,
        packageName: selectedSession.title,
        bookingDate: dk,
      })
      const slot = isMakeupPackage ? getSlotById(selectedSlotId) : undefined
      const receiptUrl =
        requiresDeposit && receiptFile ? await uploadReceipt(id, receiptFile, email) : undefined
      const graduationNote = isGraduationPackage
        ? [note, `School: ${schoolName}`, `Course: ${course}`].filter(Boolean).join(' · ')
        : note

      const booking = {
        id,
        customerName: name,
        customerEmail: email,
        customerPhone: phone,
        customerFbLink: fbLink,
        customerFbName: fbName,
        packageId: selectedSession.id,
        packageName: selectedSession.title,
        bookingDate: dk,
        bookingTime: slot ? formatSlotBookingTime(slot) : FICO_BOOKING_TIME_LABEL,
        slotId: slot?.id,
        arrivalTime: slot?.arrivalTime ?? FICO_ARRIVAL_LABEL,
        shootTime: slot?.shootTime ?? FICO_SHOOT_TIME_LABEL,
        note: graduationNote || undefined,
        schoolName: isGraduationPackage ? schoolName : undefined,
        course: isGraduationPackage ? course : undefined,
        depositAmount: requiresDeposit ? 500 : 0,
        price: parsePackagePrice(selectedSession.price),
        transactionRef: requiresDeposit ? transactionRef.trim() : undefined,
        bookingStatus: (requiresDeposit ? 'Pending Verification' : 'Confirmed') as
          | 'Pending Verification'
          | 'Confirmed',
        paymentStatus: (requiresDeposit ? 'Pending Verification' : 'Unpaid') as
          | 'Pending Verification'
          | 'Unpaid',
        createdAt: new Date().toISOString(),
        receiptUrl,
        paymentHistory: requiresDeposit
          ? [
              {
                id: 'PAY-' + Math.floor(1000 + Math.random() * 9000),
                amount: 500,
                method: paymentMethod,
                type: 'Deposit' as const,
                transactionRef: transactionRef || undefined,
                date: new Date().toISOString(),
              },
            ]
          : [],
      }
      const { booking: saved } = await saveBooking(booking)
      setStep(6)
    } catch (err) {
      console.error(err)
      setFormError(err instanceof Error ? err.message : 'Submit failed. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const resetBooking = () => {
    setStep(1)
    setSelectedSession(null)
    setSelectedDate(null)
    setSelectedSlotId('')
    setName('')
    setEmail('')
    setPhone('')
    setFbName('')
    setFbLink('')
    setNote('')
    setSchoolName('')
    setCourse('')
    setReceiptFile(null)
    setTransactionRef('')
    setSubmittedSummary(null)
  }

  return (
    <SectionShell id="booking" variant="elevated">
      <SectionHeader
        eyebrow="Booking Portal"
        title="Reserve Your Session"
        description={
          requiresDeposit
            ? 'Select your session, choose a slot on our interactive calendar, pay the ₱500 deposit via BPI, upload your receipt, and await verification.'
            : 'Select your FICO or MANA package, choose a date, and confirm your details. No online deposit — pay in full at the studio on your shoot day.'
        }
        align="center"
      />

      <div
        ref={stepPanelRef}
        id="booking-panel"
        className={`max-w-6xl mx-auto scroll-mt-28 ${cardClass} p-4 sm:p-6 md:p-10`}
      >
        {step < 6 && (
          <StepProgress
            step={step}
            isGraduation={!!isGraduationPackage}
            requiresDeposit={requiresDeposit}
          />
        )}

        {formError && (
          <div className="mb-5 border border-white/20 bg-white/5 px-4 py-3 text-sm text-white">
            {formError}
          </div>
        )}

        <div className="min-h-[min(62vh,640px)] flex flex-col">
        {/* Step 1 — Package */}
        {step === 1 && (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-center text-white">1. Select Your Package</h3>
            <div className="flex justify-center gap-2 flex-wrap">
              {(['graduation', 'capping-pinning', 'self-portrait', 'creative'] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setActiveCategory(c)
                    setFormError('')
                  }}
                  className={`px-4 py-2 text-[10px] uppercase tracking-wider border rounded-sm ${
                    activeCategory === c ? 'border-primary bg-primary text-primary-foreground' : 'border-white/10 text-white/60 hover:border-white/30 hover:text-white'
                  }`}
                >
                  {c === 'self-portrait' ? 'Self Portrait' : c === 'capping-pinning' ? 'Capping & Pinning' : c}
                </button>
              ))}
            </div>
            {packagesLoading ? (
              <div className="grid sm:grid-cols-2 gap-4">
                {[0, 1].map((i) => (
                  <div key={i} className="h-36 border border-white/10 bg-white/[0.03] animate-pulse" />
                ))}
              </div>
            ) : filteredPackages.length === 0 ? (
              <p className="text-center text-sm text-white/50 py-8">No packages available in this category yet.</p>
            ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              {filteredPackages.map((pkg) => {
                const Icon = getPackageIcon(pkg)
                const selected = selectedSession?.id === pkg.id
                const subtitle = pkg.description.split('.')[0]?.trim() || pkg.description
                return (
                  <div
                    key={pkg.id}
                    className={`relative overflow-hidden border rounded-sm transition-colors ${
                      selected ? 'border-primary bg-primary/10 ring-1 ring-primary/30' : 'border-white/10 hover:border-white/25'
                    }`}
                  >
                    {pkg.heroImage ? (
                      <>
                        <Image
                          src={pkg.heroImage}
                          alt=""
                          fill
                          className="object-cover object-center opacity-35"
                          sizes="(max-width: 640px) 100vw, 50vw"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/75 to-black/45" />
                      </>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setSelectedSession(pkg)}
                      className="relative z-10 w-full text-left p-5 pb-3"
                    >
                      <Icon className={`w-5 h-5 mb-2 ${selected ? 'text-white' : 'text-white/40'}`} />
                      <p className="font-semibold text-sm text-white tracking-wide">{pkg.title}</p>
                      {subtitle && (
                        <p className="text-[11px] text-white/55 mt-1 leading-snug">{subtitle}</p>
                      )}
                      <p className="text-white font-medium mt-2">{pkg.price}</p>
                    </button>

                    {pkg.features.length > 0 && (
                      <details className="group relative z-10 border-t border-white/10 mx-0">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-5 py-3 text-[10px] font-bold uppercase tracking-[0.2em] text-white/45 hover:text-white/70 select-none [&::-webkit-details-marker]:hidden">
                          <span>Includes</span>
                          <ChevronDown className="w-3.5 h-3.5 shrink-0 transition-transform group-open:rotate-180" />
                        </summary>
                        <ul className="px-5 pb-4 divide-y divide-white/[0.06]">
                          {pkg.features.map((item, i) => (
                            <li
                              key={item}
                              className="flex items-start gap-3 py-2 first:pt-0 last:pb-0"
                            >
                              <span className="text-[9px] font-light tabular-nums text-white/30 w-5 shrink-0 pt-0.5">
                                {String(i + 1).padStart(2, '0')}
                              </span>
                              <span className="text-[11px] text-white/70 leading-relaxed">{item}</span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                )
              })}
            </div>
            )}
            <div className="flex flex-col sm:flex-row sm:justify-end gap-3">
              <button
                type="button"
                disabled={!selectedSession}
                onClick={() => {
                  setFormError('')
                  setStep(2)
                }}
                className={btnPrimaryClass}
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Step 2 — Date */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h3 className="text-lg font-semibold text-white">2. Date{isMakeupPackage ? ' & Time Slot' : ''}</h3>
              <p className="text-sm text-white/70 max-w-xl mx-auto">
                {isMakeupPackage
                  ? 'Pick a date, then choose an available session slot.'
                  : `Up to ${FICO_DAILY_LIMIT} per day · ${FICO_AVAILABILITY_LABEL}`}
              </p>
            </div>

            <div
              className={
                isMakeupPackage
                  ? 'grid grid-cols-1 lg:grid-cols-[minmax(280px,320px)_minmax(0,1fr)] gap-5 lg:gap-8 lg:items-start'
                  : 'grid grid-cols-1 lg:grid-cols-[minmax(280px,320px)_minmax(0,1fr)] gap-5 lg:gap-8 lg:items-start max-w-3xl lg:max-w-none mx-auto w-full'
              }
            >
              {/* Calendar — sticky on desktop */}
              <div className="lg:sticky lg:top-24 lg:self-start">
                <div className={`${cardClass} p-4 sm:p-5`}>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs uppercase tracking-wider font-semibold text-white/70">
                      {monthNames[viewMonth]} {viewYear}
                    </span>
                    <div className="flex gap-1 rounded-sm border border-white/10 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => {
                          const d = new Date(viewYear, viewMonth - 1, 1)
                          setViewYear(d.getFullYear())
                          setViewMonth(d.getMonth())
                        }}
                        className="p-2 text-white/60 hover:text-white hover:bg-white/5 transition-colors"
                        aria-label="Previous month"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const d = new Date(viewYear, viewMonth + 1, 1)
                          setViewYear(d.getFullYear())
                          setViewMonth(d.getMonth())
                        }}
                        className="p-2 text-white/60 hover:text-white hover:bg-white/5 transition-colors"
                        aria-label="Next month"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-7 gap-1 text-center">
                    {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
                      <span key={d} className="text-[10px] font-medium text-white/40 py-1">
                        {d}
                      </span>
                    ))}
                    {cells.map((day, idx) =>
                      day === null ? (
                        <div key={`cal-${viewYear}-${viewMonth}-pad-${idx}`} className="h-10" />
                      ) : (
                        <button
                          key={`cal-${viewYear}-${viewMonth}-day-${day}-${idx}`}
                          type="button"
                          disabled={isPast(day) || isDayFull(day)}
                          title={isDayFull(day) ? 'Fully booked' : undefined}
                          onClick={() => pickDate(day)}
                          className={`h-10 text-sm rounded-sm transition-colors ${
                            isSame(day)
                              ? 'bg-primary text-primary-foreground font-bold shadow-[0_0_12px_rgba(5,0,208,0.35)]'
                              : isPast(day) || isDayFull(day)
                                ? 'text-white/20 line-through cursor-not-allowed'
                                : 'text-white/80 hover:bg-white/10'
                          }`}
                        >
                          {day}
                        </button>
                      ),
                    )}
                  </div>
                  {selectedDate && (
                    <p className="mt-4 pt-4 border-t border-white/10 text-xs text-white/55 text-center lg:text-left">
                      Selected:{' '}
                      <span className="text-white font-medium">
                        {selectedDate.toLocaleDateString('en-US', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </p>
                  )}
                </div>
              </div>

              {/* Time slots / availability — independent scroll */}
              <div className="min-h-0 flex flex-col">
                {!selectedDate ? (
                  <div
                    className={`${cardClass} flex flex-col items-center justify-center text-center p-8 sm:p-10 min-h-[240px] lg:min-h-[320px] lg:max-h-[80vh]`}
                  >
                    <p className="text-sm font-medium text-white/70">Select a date</p>
                    <p className="text-xs text-white/40 mt-2 max-w-xs leading-relaxed">
                      {isMakeupPackage
                        ? 'Available session slots will appear here.'
                        : 'Capacity for your chosen day will appear here.'}
                    </p>
                  </div>
                ) : isMakeupPackage ? (
                  <div
                    className={`${cardClass} flex flex-col overflow-hidden max-h-[min(80vh,640px)] lg:max-h-[80vh]`}
                  >
                    <div className="shrink-0 px-4 sm:px-5 pt-4 sm:pt-5 pb-3 border-b border-white/10">
                      <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-white/45">
                        Available times
                      </p>
                      <p className="text-sm font-semibold text-white mt-1">
                        {selectedDate.toLocaleDateString('en-US', {
                          weekday: 'long',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </p>
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto overscroll-contain px-4 sm:px-5 py-4 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.2)_transparent]">
                      <BookingSlotPicker
                        selectedSlotId={selectedSlotId}
                        onSelect={(id) => {
                          setSelectedSlotId(id)
                          const s = getSlotById(id)
                          if (s) setSelectedTimeSlot(formatSlotBookingTime(s))
                        }}
                        isSlotFull={isSlotFull}
                        isSlotBlocked={isSlotBlocked}
                      />
                    </div>
                  </div>
                ) : (
                  <div
                    className={`${cardClass} flex flex-col justify-center p-6 sm:p-8 text-center min-h-[200px] lg:min-h-[280px] lg:max-h-[80vh]`}
                  >
                    <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-white/45 mb-3">
                      Session time
                    </p>
                    <p className="text-base sm:text-lg font-semibold text-white">{FICO_BOOKING_TIME_LABEL}</p>
                    <p className="text-sm text-white/70 mt-3">
                      {(ficoRemaining ?? 0) > 0
                        ? `${ficoRemaining} of ${ficoBookableLimit} spots left`
                        : 'Fully booked on this date'}
                    </p>
                    {selectedFicoHold && selectedFicoHold.spotsBlocked > 0 && (
                      <p className="text-xs text-amber-400/80 mt-3">
                        {selectedFicoHold.spotsBlocked} spot{selectedFicoHold.spotsBlocked === 1 ? '' : 's'} held by
                        studio
                      </p>
                    )}
                    <p className="text-xs text-white/40 mt-4 leading-relaxed max-w-sm mx-auto">
                      {FICO_AVAILABILITY_LABEL}. No specific time slot — first come, first served within daily
                      capacity.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className={stepNavClass}>
              <button type="button" onClick={() => setStep(1)} className={btnBackClass}>
                Back
              </button>
              <button type="button" disabled={!canProceedDate} onClick={goAfterDate} className={btnPrimaryClass}>
                Next
              </button>
            </div>
          </div>
        )}

        {/* Step 3 — Graduation session details (mockup layout) */}
        {step === 3 && isGraduationPackage && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!validateGraduationStep()) return
              setStep(4)
            }}
            className="space-y-6"
          >
            <div className="text-center space-y-1">
              <h3 className="text-lg font-semibold text-white">3. Details</h3>
              <p className="text-sm text-white/70">
                Enter your school and course. Below are the hood, toga, tassel, and background colors available in our shop — no need to choose online.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 items-start">
              {/* Form — below preview on mobile */}
              <div className="space-y-5 sm:space-y-6 order-2 md:order-1">
                <div>
                  <p className="font-serif text-lg sm:text-xl text-white mb-3 sm:mb-4">Details</p>
                  <div className="space-y-3">
                    <div>
                      <label className={labelClass}>School Name</label>
                      <input required value={schoolName} onChange={(e) => setSchoolName(e.target.value)} className={inputClass} placeholder="Enter school name" />
                    </div>
                    <div>
                      <label className={labelClass}>Course</label>
                      <input required value={course} onChange={(e) => setCourse(e.target.value)} className={inputClass} placeholder="Enter course" />
                    </div>
                  </div>
                </div>

                <div>
                  <p className={labelClass + ' mb-1'}>Available Hood Colors</p>
                  <p className="text-[11px] text-white/50 mb-3">Available in our shop — bring your school’s hood color or pick on session day.</p>
                  <div className="grid grid-cols-2 min-[420px]:grid-cols-3 sm:grid-cols-4 gap-1.5 sm:gap-2">
                    {HOOD_COLOR_GRID.map((color) => (
                      <div
                        key={color}
                        style={{ background: colorToPreviewFill(color) }}
                        className={`py-2.5 px-1 text-[9px] sm:text-[10px] font-semibold uppercase tracking-wide border border-white/25 text-center ${colorSwatchTextClass(color)}`}
                      >
                        {color}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-4">
                  <div>
                    <p className={labelClass + ' mb-1'}>Available Togas</p>
                    <p className="text-[11px] text-white/50 mb-2">Stocked at the studio</p>
                    <div className="flex flex-col gap-2">
                      {TOGA_COLORS.map((c) => (
                        <div
                          key={c}
                          style={{ background: colorToPreviewFill(c) }}
                          className={`py-2 text-[10px] uppercase border border-white/25 rounded-sm text-center font-semibold ${colorSwatchTextClass(c)}`}
                        >
                          {c}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className={labelClass + ' mb-1'}>Available Tassels</p>
                    <p className="text-[11px] text-white/50 mb-2">Stocked at the studio</p>
                    <div className="flex flex-wrap gap-1.5">
                      {TASSEL_COLORS.map((c) => (
                        <div
                          key={c}
                          style={{ background: colorToPreviewFill(c) }}
                          className={`px-2.5 py-1.5 text-[9px] uppercase border border-white/25 rounded-sm ${colorSwatchTextClass(c)}`}
                        >
                          {c}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <p className="text-xs text-white/80 leading-relaxed">{GRADUATION_TOGA_NOTE}</p>
              </div>

              {/* Preview — shown first on mobile */}
              <div className="space-y-4 order-1 md:order-2 md:sticky md:top-28 md:self-start">
                <BookingGraduationPreview />

                <div>
                  <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-white mb-1">
                    Available Background Colors
                  </p>
                  <p className="text-[11px] text-white/50 mb-3">Studio backgrounds you can use on shoot day</p>
                  <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:gap-3">
                    {STUDIO_BACKGROUNDS.map((bg) => (
                      <div
                        key={bg.id}
                        className="relative aspect-square sm:w-20 sm:h-20 md:w-24 md:h-24 overflow-hidden border-2 border-white/20"
                      >
                        <Image src={bg.image} alt={bg.label} fill className="object-cover" />
                        <span className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[8px] uppercase py-0.5 text-center">
                          {bg.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className={stepNavClass}>
              <button type="button" onClick={() => setStep(2)} className={btnBackClass}>
                Back
              </button>
              <button type="submit" className={btnPrimaryClass + ' gap-2'}>
                Continue <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        )}

        {/* Step 4 — Contact (mockup with sidebar) */}
        {step === 4 && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!validateContactStep()) return
              if (requiresDeposit) {
                setStep(5)
                return
              }
              void submitBooking()
            }}
          >
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-white">{isGraduationPackage ? '4. Your Information' : '3. Your Information'}</h3>
              <p className="text-sm text-white/70 mt-1">
                Provide your contact info and any special instructions or preferences for the shoot.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,240px)_1fr] gap-6 lg:gap-8">
              <BookingSummarySidebar
                packageInfo={selectedSession}
                bookingDate={selectedDate}
                timeSlot={selectedTimeSlot}
                graduation={graduationSummary}
              />

              <div className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Full Name *</label>
                    <input required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Phone Number *</label>
                    <input required value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Email Address *</label>
                  <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Facebook Profile Name *</label>
                    <input required value={fbName} onChange={(e) => setFbName(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Facebook Profile Link *</label>
                    <input required value={fbLink} onChange={(e) => setFbLink(e.target.value)} className={inputClass} placeholder="https://facebook.com/..." />
                  </div>
                </div>
                <div>
                  <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between mb-1.5">
                    <label className={labelClass}>Pre-Shoot Note / Special Requests</label>
                    <span className="text-[8px] uppercase tracking-wider text-white bg-white/10 px-2 py-0.5 border border-white/20 w-fit">Requested before shoot</span>
                  </div>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={4}
                    placeholder="Request background colors, props, or lighting adjustments..."
                    className={inputClass + ' resize-none'}
                  />
                </div>
              </div>
            </div>

            <div className={`${stepNavClass} mt-6 sm:mt-8`}>
              <button type="button" onClick={goBackFromContact} className={btnBackClass} disabled={isSubmitting}>
                Back
              </button>
              <button type="submit" disabled={isSubmitting} className={btnPrimaryClass + ' gap-2'}>
                {isSubmitting
                  ? 'Submitting...'
                  : requiresDeposit
                    ? (
                      <>
                        Proceed to Payment <ArrowRight className="w-4 h-4" />
                      </>
                      )
                    : 'Submit Booking'}
              </button>
            </div>
          </form>
        )}

        {/* Step 5 — Deposit */}
        {step === 5 && (
          <form onSubmit={submitBooking} className="flex flex-col flex-1">
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,240px)_1fr] gap-6 lg:gap-8 flex-1">
              <BookingSummarySidebar
                packageInfo={selectedSession}
                bookingDate={selectedDate}
                timeSlot={selectedTimeSlot}
                graduation={graduationSummary}
              />

              <div className="w-full max-w-lg mx-auto lg:mx-0 space-y-5 sm:space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-white lg:text-left text-center">
                    {isGraduationPackage ? '5. Deposit' : '4. Deposit'} — PHP 500
                  </h3>
                  <p className="text-sm text-white/70 mt-1 lg:text-left text-center">
                    Scan the BPI QR below to pay ₱500, then upload a clear screenshot of your BPI payment receipt (not a studio photo).
                  </p>
                </div>
                <BpiQrDisplay
                  depositLabel="₱500"
                  hint="Pay exactly ₱500, then upload a clear screenshot of your BPI payment receipt below."
                />
                <div>
                  <label className={labelClass}>BPI Transaction Reference (optional)</label>
                  <input
                    value={transactionRef}
                    onChange={(e) => setTransactionRef(e.target.value)}
                    placeholder="e.g. 1234567890 — if shown on your receipt"
                    className={inputClass + ' mt-1.5 font-mono'}
                  />
                </div>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-white/20 p-6 sm:p-10 text-center cursor-pointer hover:border-primary/40 hover:bg-white/[0.03] transition-colors"
                >
                  <Upload className="w-8 h-8 mx-auto mb-2 text-white" />
                  <p className="text-sm text-white/70">{receiptFile?.name || 'Click to upload receipt *'}</p>
                  <input ref={fileInputRef} type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => e.target.files?.[0] && setReceiptFile(e.target.files[0])} />
                </div>
              </div>
            </div>

            <div className={`${stepNavClass} mt-6 sm:mt-8`}>
              <button type="button" onClick={() => setStep(4)} className={btnBackClass}>
                Back
              </button>
              <button type="submit" disabled={!receiptFile || isSubmitting} className={btnPrimaryClass}>
                {isSubmitting ? 'Submitting...' : 'Submit Booking'}
              </button>
            </div>
          </form>
        )}

        {/* Step 6 — Confirmation */}
        {step === 6 && (
          <div className="max-w-md mx-auto text-center space-y-5 py-4">
            <div className="w-14 h-14 rounded-full bg-primary/15 flex items-center justify-center mx-auto border border-primary/30">
              <Check className="w-7 h-7 text-white" />
            </div>
            <h3 className="text-xl font-semibold text-white">
              {(submittedSummary?.depositAmount ?? 500) === 0 ? 'Booking Confirmed' : 'Booking Submitted'}
            </h3>
            <p className="text-sm text-white/70">
              {(submittedSummary?.depositAmount ?? 500) === 0
                ? 'Your session is reserved. Full payment is due at the studio on your shoot day. A confirmation email is on the way.'
                : 'Your deposit is pending verification. You will receive a confirmation email once approved.'}
            </p>
            <div className="border border-primary/30 bg-primary/10 p-6 space-y-4 text-left">
              <div>
                <p className="text-[9px] uppercase tracking-wider text-white/40">Booking Reference</p>
                <p className="text-2xl font-bold text-white font-mono mt-1">{bookingId}</p>
                <button type="button" onClick={() => { navigator.clipboard.writeText(bookingId); setCopiedText(true) }} className="text-[10px] text-white mt-3 inline-flex items-center gap-1">
                  <Copy className="w-3 h-3" /> {copiedText ? 'Copied!' : 'Copy reference'}
                </button>
              </div>
              <div className="border-t border-primary/20 pt-4 space-y-2 text-sm">
                {(submittedSummary?.depositAmount ?? 500) === 0 ? (
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <p className="text-white/40">Payment</p>
                      <p className="font-semibold text-white">Pay at studio</p>
                    </div>
                    <div>
                      <p className="text-white/40">Deposit</p>
                      <p className="font-semibold text-white">None</p>
                    </div>
                    {(submittedSummary?.packageName || selectedSession) && (
                      <div className="col-span-2">
                        <p className="text-white/40">Package · Date</p>
                        <p className="text-white/80">
                          {submittedSummary?.packageName ?? selectedSession?.title}
                          {' · '}
                          {submittedSummary?.bookingDate ?? (selectedDate ? formatDateKey(selectedDate) : '—')}
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <p className="text-[9px] uppercase tracking-wider text-white/40">Payment Submitted</p>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <p className="text-white/40">Method</p>
                        <p className="font-semibold text-white">{submittedSummary?.paymentMethod ?? paymentMethod}</p>
                      </div>
                      <div>
                        <p className="text-white/40">Deposit</p>
                        <p className="font-semibold text-white">₱{(submittedSummary?.depositAmount ?? 500).toFixed(2)}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-white/40">BPI Transaction Reference</p>
                        <p className="font-mono font-bold text-white text-base mt-0.5">
                          {submittedSummary?.transactionRef || transactionRef.trim() || 'Not provided'}
                        </p>
                        {(submittedSummary?.transactionRef || transactionRef.trim()) && (
                          <button
                            type="button"
                            onClick={() => {
                              const ref = submittedSummary?.transactionRef || transactionRef.trim()
                              if (ref) {
                                navigator.clipboard.writeText(ref)
                                setCopiedRef(true)
                              }
                            }}
                            className="text-[10px] text-white mt-2 inline-flex items-center gap-1"
                          >
                            <Copy className="w-3 h-3" /> {copiedRef ? 'Copied!' : 'Copy transaction ref'}
                          </button>
                        )}
                      </div>
                      {(submittedSummary?.packageName || selectedSession) && (
                        <div className="col-span-2">
                          <p className="text-white/40">Package · Date</p>
                          <p className="text-white/80">
                            {submittedSummary?.packageName ?? selectedSession?.title}
                            {' · '}
                            {submittedSummary?.bookingDate ?? (selectedDate ? formatDateKey(selectedDate) : '—')}
                          </p>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
            <button type="button" onClick={resetBooking} className={btnBackClass + ' inline-flex items-center gap-2'}>
              <RefreshCw className="w-3.5 h-3.5" /> New Booking
            </button>
          </div>
        )}
        </div>
      </div>
    </SectionShell>
  )
}

export default function Booking() {
  return (
    <Suspense
      fallback={
        <SectionShell id="booking" variant="elevated">
          <div className="max-w-6xl mx-auto border border-white/10 bg-white/[0.02] p-6 sm:p-10">
            <div className="h-8 w-48 mx-auto bg-white/10 animate-pulse mb-8" />
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="h-36 bg-white/[0.04] animate-pulse" />
              <div className="h-36 bg-white/[0.04] animate-pulse" />
            </div>
          </div>
        </SectionShell>
      }
    >
      <BookingForm />
    </Suspense>
  )
}
