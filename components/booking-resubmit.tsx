'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { AlertCircle, Check, RefreshCw, Upload } from 'lucide-react'
import SectionHeader from '@/components/section-header'
import SectionShell from '@/components/section-shell'
import {
  lookupBookingForResubmit,
  resubmitReceipt,
  uploadReceiptForResubmit,
  type PublicResubmitBooking,
} from '@/lib/data-store'
import { isForgedRejection } from '@/lib/rejection-reasons'
import BpiQrDisplay from '@/components/bpi-qr-display'

const inputClass =
  'w-full border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30'

const labelClass = 'text-[10px] font-bold tracking-[0.12em] uppercase text-white'

const cardClass = 'border border-white/10 bg-white/[0.02] backdrop-blur-sm'

const btnPrimaryClass =
  'w-full sm:w-auto inline-flex items-center justify-center bg-primary text-primary-foreground px-8 py-3 text-xs uppercase font-semibold disabled:opacity-40'

function BookingResubmitForm() {
  const searchParams = useSearchParams()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [bookingId, setBookingId] = useState('')
  const [email, setEmail] = useState('')
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupError, setLookupError] = useState('')
  const [booking, setBooking] = useState<PublicResubmitBooking | null>(null)

  const paymentMethod = 'BPI' as const
  const [transactionRef, setTransactionRef] = useState('')
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    const fromUrl = searchParams.get('booking')?.trim()
    if (fromUrl) setBookingId(fromUrl)
    if (typeof window !== 'undefined' && window.location.hash === '#resubmit') {
      document.getElementById('resubmit')?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [searchParams])

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLookupLoading(true)
    setLookupError('')
    setBooking(null)
    setSubmitted(false)

    try {
      const result = await lookupBookingForResubmit(bookingId.trim(), email.trim())
      setBooking(result)
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : 'Lookup failed.')
    } finally {
      setLookupLoading(false)
    }
  }

  const handleResubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!booking || !receiptFile) return

    setSubmitting(true)
    setSubmitError('')

    try {
      const receiptUrl = await uploadReceiptForResubmit(booking.id, email.trim(), receiptFile)
      await resubmitReceipt({
        id: booking.id,
        email: email.trim(),
        receiptUrl,
        transactionRef: transactionRef.trim() || undefined,
        paymentMethod,
      })
      setSubmitted(true)
      setReceiptFile(null)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit receipt.')
    } finally {
      setSubmitting(false)
    }
  }

  const resetForm = () => {
    setBooking(null)
    setSubmitted(false)
    setLookupError('')
    setSubmitError('')
    setReceiptFile(null)
    setTransactionRef('')
  }

  return (
    <SectionShell id="resubmit" variant="elevated">
      <SectionHeader
        eyebrow="Payment Recovery"
        title="Resubmit Your Receipt"
        description="If your deposit receipt was rejected, enter your booking reference and email to upload a new payment proof. Your slot stays reserved while we review it."
        align="center"
      />

      <div className={`max-w-xl mx-auto ${cardClass} p-4 sm:p-6 md:p-8`}>
        {submitted ? (
          <div className="text-center space-y-4 py-4">
            <div className="w-14 h-14 rounded-full bg-primary/15 flex items-center justify-center mx-auto border border-primary/30">
              <Check className="w-7 h-7 text-white" />
            </div>
            <h3 className="text-lg font-semibold text-white">Receipt Resubmitted</h3>
            <p className="text-sm text-white/70">
              Booking <span className="font-mono text-white">{booking?.id}</span> is back in the verification queue.
              You will receive an email once it is approved.
            </p>
            <button type="button" onClick={resetForm} className={btnPrimaryClass + ' gap-2'}>
              <RefreshCw className="w-3.5 h-3.5" /> Look Up Another Booking
            </button>
          </div>
        ) : !booking ? (
          <form onSubmit={handleLookup} className="space-y-4">
            <div>
              <label className={labelClass}>Booking Reference</label>
              <input
                required
                value={bookingId}
                onChange={(e) => setBookingId(e.target.value.toUpperCase())}
                placeholder="FM-123456 or FM-RCP-123456-####"
                className={inputClass + ' font-mono mt-1.5'}
              />
            </div>
            <div>
              <label className={labelClass}>Email Address</label>
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Same email used when booking"
                className={inputClass + ' mt-1.5'}
              />
            </div>

            {lookupError && (
              <div className="flex gap-2 items-start border border-white/20 bg-white/5 p-3 text-sm text-white">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <p>{lookupError}</p>
              </div>
            )}

            <button type="submit" disabled={lookupLoading} className={btnPrimaryClass + ' w-full'}>
              {lookupLoading ? 'Looking up...' : 'Find My Booking'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleResubmit} className="space-y-5">
            <div className="border border-white/10 bg-black/30 p-4 space-y-2 text-sm">
              <p className="text-white font-semibold">{booking.customerName}</p>
              <p className="text-white/70">{booking.packageName}</p>
              <p className="text-white/50 text-xs">
                {booking.bookingDate} · {booking.bookingTime}
              </p>
              <p className="text-white font-semibold text-xs">Deposit: ₱{booking.depositAmount.toFixed(2)}</p>
              {booking.rejectionReason && (
                <div
                  className={`mt-3 border-l-2 pl-3 text-xs ${
                    isForgedRejection('', booking.rejectionReason)
                      ? 'border-red-500 bg-red-500/10 p-3'
                      : 'border-red-500/60'
                  }`}
                >
                  <p className="font-semibold uppercase tracking-wider text-[9px] text-white mb-1">
                    {isForgedRejection('', booking.rejectionReason)
                      ? 'Forged / invalid receipt'
                      : 'Rejection reason'}
                  </p>
                  <p className="text-white/90 italic">
                    {booking.rejectionReason}
                  </p>
                  {isForgedRejection('', booking.rejectionReason) && (
                    <p className="text-[10px] text-white/70 mt-2 leading-relaxed">
                      Upload a genuine BPI payment screenshot from your transaction history — not a studio photo or sample image.
                    </p>
                  )}
                </div>
              )}
            </div>

            <BpiQrDisplay
              depositLabel={`₱${booking.depositAmount.toFixed(0)}`}
              hint="Scan to pay, then upload your BPI payment screenshot below."
            />

            <div>
              <label className={labelClass}>BPI Transaction Reference (optional)</label>
              <input
                value={transactionRef}
                onChange={(e) => setTransactionRef(e.target.value)}
                placeholder="BPI reference number"
                className={inputClass + ' mt-1.5'}
              />
            </div>

            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-white/20 p-6 sm:p-8 text-center cursor-pointer hover:border-primary/40 hover:bg-white/[0.03] transition-colors"
            >
              <Upload className="w-7 h-7 mx-auto mb-2 text-white" />
              <p className="text-sm text-white/70">
                {receiptFile?.name ||
                  (booking.rejectionReason && isForgedRejection('', booking.rejectionReason)
                    ? 'Upload genuine BPI payment screenshot *'
                    : 'Click to upload new receipt *')}
              </p>
              <p className="text-[10px] text-white/40 mt-1">JPG, PNG, or PDF · Max 5 MB</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && setReceiptFile(e.target.files[0])}
              />
            </div>

            {submitError && (
              <div className="flex gap-2 items-start border border-white/20 bg-white/5 p-3 text-sm text-white">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <p>{submitError}</p>
              </div>
            )}

            <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-2 border-t border-white/10">
              <button type="button" onClick={resetForm} className="text-xs uppercase text-white/50 hover:text-white">
                ← Use different booking
              </button>
              <button type="submit" disabled={!receiptFile || submitting} className={btnPrimaryClass}>
                {submitting ? 'Uploading...' : 'Submit New Receipt'}
              </button>
            </div>
          </form>
        )}
      </div>
    </SectionShell>
  )
}

export default function BookingResubmit() {
  return (
    <Suspense
      fallback={
        <SectionShell id="resubmit" variant="elevated">
          <div className="max-w-xl mx-auto border border-white/10 bg-white/[0.02] p-6 sm:p-8 space-y-4">
            <div className="h-6 w-40 mx-auto bg-white/10 animate-pulse" />
            <div className="h-10 bg-white/[0.04] animate-pulse" />
            <div className="h-10 bg-white/[0.04] animate-pulse" />
          </div>
        </SectionShell>
      }
    >
      <BookingResubmitForm />
    </Suspense>
  )
}
