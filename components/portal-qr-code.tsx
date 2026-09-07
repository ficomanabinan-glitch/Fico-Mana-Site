'use client'

import { useRef, useState } from 'react'
import { Check, Copy, Download, QrCode } from 'lucide-react'
import { QRCodeCanvas } from 'qrcode.react'
import { cn } from '@/lib/utils'

type PortalQrCodeProps = {
  portalUrl: string
  customerName: string
  bookingId: string
  className?: string
  heading?: string
}

const qrAction =
  'inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-white/15 px-3 py-2.5 text-caption font-semibold uppercase tracking-wider text-white/70 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/35 hover:bg-white/[0.07] hover:text-white active:translate-y-0 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4CEFF]/70'

function safeFilePart(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'client'
}

export default function PortalQrCode({
  portalUrl,
  customerName,
  bookingId,
  className,
  heading = 'Your Portal QR',
}: PortalQrCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [message, setMessage] = useState('')

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(portalUrl)
      setMessage('Private link copied.')
    } catch {
      setMessage('Copy failed. Try: download the QR code instead.')
    }
  }

  const downloadQr = () => {
    const canvas = canvasRef.current
    if (!canvas) {
      setMessage('QR download is unavailable. Try: take a clear picture of the code.')
      return
    }
    const link = document.createElement('a')
    link.download = `ficomana-${safeFilePart(bookingId)}-portal-qr.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
    setMessage('QR code downloaded.')
  }

  return (
    <section
      className={cn('fico-card border border-[#C4CEFF]/20 bg-[#C4CEFF]/[0.05]', className)}
      data-testid="portal-qr-code"
    >
      <div className="flex items-center gap-2 text-[#C4CEFF]">
        <QrCode className="size-4" />
        <h2 className="text-caption font-semibold uppercase tracking-label">{heading}</h2>
      </div>
      <p className="mt-2 text-caption leading-relaxed text-white/45">
        Open a phone camera and point it at this code to open {customerName}&apos;s private portal.
      </p>
      <div className="mt-4 flex justify-center rounded-xl bg-white p-3 shadow-[0_18px_50px_rgba(0,0,0,0.35)]">
        <QRCodeCanvas
          ref={canvasRef}
          value={portalUrl}
          size={288}
          level="Q"
          marginSize={3}
          bgColor="#ffffff"
          fgColor="#050505"
          title={`FICO MANA client portal for ${customerName}`}
          style={{ width: '100%', height: 'auto', maxWidth: '288px' }}
        />
      </div>
      <p className="mt-3 text-center font-mono text-caption text-white/35">{bookingId}</p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => void copyLink()} className={qrAction}>
          {message === 'Private link copied.' ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          Copy Link
        </button>
        <button type="button" onClick={downloadQr} className={qrAction}>
          <Download className="size-3.5" />
          Download QR
        </button>
      </div>
      {message ? <p className="mt-3 text-center text-caption text-white/50" role="status">{message}</p> : null}
      <p className="mt-4 border-t border-white/[0.08] pt-3 text-caption leading-relaxed text-amber-100/65">
        Keep this code private. Anyone who has the QR can open this client portal while it is active.
      </p>
    </section>
  )
}
