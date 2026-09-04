'use client'

import { useState } from 'react'
import { Check, ShieldCheck } from 'lucide-react'

export default function ClientPortalTrustedDevice({
  publicId,
  signature,
}: {
  publicId: string
  signature: string
}) {
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const remember = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/portal/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicId, signature }),
      })
      const data = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(data.error || 'Could not remember this device.')
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remember this device.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-[#C4CEFF] shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-white">Trusted device</p>
          <p className="text-[11px] text-white/45 mt-1">
            Keep this portal available on this device without reopening the magic link.
          </p>
          <button
            type="button"
            disabled={loading || saved}
            onClick={remember}
            className="mt-3 inline-flex items-center gap-1.5 border border-white/15 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-white/80 hover:border-white/30 disabled:opacity-60"
          >
            {saved ? <Check className="w-3.5 h-3.5" /> : null}
            {saved ? 'Device remembered' : loading ? 'Saving…' : 'Remember this device'}
          </button>
          {error ? <p className="text-[10px] text-red-300 mt-2">{error}</p> : null}
        </div>
      </div>
    </div>
  )
}
