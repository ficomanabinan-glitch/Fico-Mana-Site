'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { AlertCircle, Check, Upload } from 'lucide-react'
import Navbar from '@/components/navbar'
import Footer from '@/components/footer'
import SectionHeader from '@/components/section-header'
import SectionShell from '@/components/section-shell'

const inputClass =
  'w-full border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30'

const labelClass = 'text-[10px] font-bold tracking-[0.12em] uppercase text-white'

const cardClass = 'border border-white/10 bg-white/[0.02] backdrop-blur-sm'

const btnPrimaryClass =
  'w-full inline-flex items-center justify-center bg-primary text-primary-foreground px-8 py-3.5 text-xs uppercase font-semibold disabled:opacity-40 hover:bg-primary/90 transition-colors'

type MatchOption = {
  id: string
  customerName: string
  packageName: string
  bookingDate: string
  bookingTime: string
}

function SubmitSelectionForm() {
  const searchParams = useSearchParams()

  const [name, setName] = useState('')
  const [driveLink, setDriveLink] = useState('')
  const [bookingId, setBookingId] = useState('')
  const [showBookingId, setShowBookingId] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [matches, setMatches] = useState<MatchOption[]>([])
  const [done, setDone] = useState<{ id: string; customerName: string } | null>(null)

  useEffect(() => {
    const fromUrl = searchParams.get('booking')?.trim()
    if (fromUrl) {
      setBookingId(fromUrl.toUpperCase())
      setShowBookingId(true)
    }
  }, [searchParams])

  const submit = async (resolvedBookingId?: string) => {
    setSubmitting(true)
    setError('')
    setMatches([])

    try {
      const res = await fetch('/api/bookings/submit-raw-photo-public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          rawPhotoLink: driveLink.trim(),
          bookingId: (resolvedBookingId || bookingId).trim() || undefined,
        }),
      })
      const data = await res.json()

      if (res.status === 409 && Array.isArray(data.matches)) {
        setMatches(data.matches as MatchOption[])
        setError(data.error || 'Multiple bookings found — pick yours.')
        return
      }

      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit.')
      }

      setDone({ id: data.id, customerName: data.customerName || name.trim() })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    void submit()
  }

  if (done) {
    return (
      <div className={`max-w-lg mx-auto text-center space-y-4 py-10 px-6 ${cardClass}`}>
        <div className="w-14 h-14 rounded-full bg-primary/15 flex items-center justify-center mx-auto border border-primary/30">
          <Check className="w-7 h-7 text-white" />
        </div>
        <h3 className="text-lg font-semibold text-white">Submitted for Filtering</h3>
        <p className="text-sm text-white/70 leading-relaxed">
          Thanks, <span className="text-white font-medium">{done.customerName}</span>. Your{' '}
          <span className="text-white/90">5 Enhanced Photos</span> folder is now in our filtering queue for booking{' '}
          <span className="font-mono text-white">{done.id}</span>.
        </p>
        <p className="text-xs text-white/40">
          We emailed a confirmation if your booking has a valid email on file. Editors will review your
          picks and email you when approved — or if anything needs to be resubmitted.
        </p>
        <button
          type="button"
          onClick={() => {
            setDone(null)
            setName('')
            setDriveLink('')
            setBookingId('')
            setMatches([])
            setError('')
          }}
          className="text-[10px] font-bold uppercase tracking-wider text-white/50 hover:text-white pt-2"
        >
          Submit another
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <form onSubmit={handleSubmit} className={`space-y-5 p-6 sm:p-8 ${cardClass}`}>
        <div className="flex items-start gap-3 border-b border-white/10 pb-4">
          <div className="w-9 h-9 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0">
            <Upload className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Submit your 5 Enhanced Photos</p>
            <p className="text-[11px] text-white/45 mt-1 leading-relaxed">
              Paste the Google Drive link to your <strong className="text-white/70">5 Enhanced Photos</strong> folder
              (with your 5 original raw photos and a photo of the completed Printing Template), then enter your full name.
            </p>
          </div>
        </div>

        <div>
          <label className={labelClass}>Full Name</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Same name used when booking"
            className={inputClass + ' mt-1.5'}
            autoComplete="name"
          />
        </div>

        <div>
          <label className={labelClass}>Google Drive Link — “5 Enhanced Photos” Folder</label>
          <input
            required
            type="url"
            value={driveLink}
            onChange={(e) => setDriveLink(e.target.value)}
            placeholder="https://drive.google.com/drive/folders/..."
            className={inputClass + ' mt-1.5'}
          />
          <p className="text-[10px] text-white/40 mt-1.5 leading-relaxed">
            Must be the link to your &quot;5 Enhanced Photos&quot; folder (5 original raw photos + Printing Template photo).
          </p>
        </div>

        {showBookingId ? (
          <div>
            <label className={labelClass}>Booking Reference</label>
            <input
              value={bookingId}
              onChange={(e) => setBookingId(e.target.value.toUpperCase())}
              placeholder="FM-123456"
              className={inputClass + ' font-mono mt-1.5'}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowBookingId(true)}
            className="text-[10px] font-bold uppercase tracking-wider text-white/40 hover:text-white/70"
          >
            + Add booking reference (optional)
          </button>
        )}

        {error && (
          <div className="flex gap-2 items-start border border-red-500/20 bg-red-950/20 p-3.5 text-xs text-red-300">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <p className="leading-relaxed">{error}</p>
          </div>
        )}

        {matches.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">Which booking is yours?</p>
            {matches.map((m) => (
              <button
                key={m.id}
                type="button"
                disabled={submitting}
                onClick={() => {
                  setBookingId(m.id)
                  void submit(m.id)
                }}
                className="w-full text-left border border-white/10 hover:border-primary/40 bg-black/30 hover:bg-primary/5 p-3 transition-colors disabled:opacity-50"
              >
                <p className="text-sm font-semibold text-white">{m.customerName}</p>
                <p className="text-[11px] text-white/45 mt-0.5">
                  <span className="font-mono text-primary">{m.id}</span>
                  {' · '}
                  {m.bookingDate} {m.bookingTime} · {m.packageName}
                </p>
              </button>
            ))}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || !name.trim() || !driveLink.trim()}
          className={btnPrimaryClass}
        >
          {submitting ? 'Submitting…' : 'Submit for Filtering'}
        </button>
      </form>
    </div>
  )
}

export default function SubmitRawPhotoPage() {
  return (
    <main className="min-h-screen bg-black text-white flex flex-col justify-between">
      <Navbar />

      <SectionShell id="submit-raw-photo" className="pt-28 pb-16 flex-1 flex flex-col justify-center">
        <SectionHeader
          eyebrow="Photo Selection"
          title="Submit for Filtering"
          description="Enter your full name and the Google Drive link to your “5 Enhanced Photos” folder. It goes straight into our filtering queue."
          align="center"
        />

        <Suspense
          fallback={
            <div className="max-w-lg mx-auto border border-white/10 bg-white/[0.02] p-8 space-y-4">
              <div className="h-6 w-40 mx-auto bg-white/10 animate-pulse" />
              <div className="h-10 bg-white/[0.04] animate-pulse" />
              <div className="h-10 bg-white/[0.04] animate-pulse" />
            </div>
          }
        >
          <SubmitSelectionForm />
        </Suspense>
      </SectionShell>

      <Footer />
    </main>
  )
}
