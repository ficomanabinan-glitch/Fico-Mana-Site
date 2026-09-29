'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import { startPrivateAttachmentDownload } from '@/lib/private-attachment-download'

export default function PortalEditedDownload({ url, count }: {
  url: string
  count: number
}) {
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  async function save() {
    if (saving) return
    setSaving(true)
    setMessage('')
    try {
      await startPrivateAttachmentDownload(url)
      setMessage('Your ZIP download has started. Check your browser downloads.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The edited photos could not be saved. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return <div className="mt-4 rounded-control border border-emerald-500/20 bg-emerald-500/[0.05] p-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><p className="text-sm font-semibold text-emerald-200">Your photos are ready</p><p className="mt-1 text-caption text-white/45">{count} edited photo{count === 1 ? '' : 's'} · Download all as a ZIP, or save one photo below.</p></div>
      <button type="button" disabled={saving} onClick={() => void save()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-control bg-primary px-4 py-2.5 text-caption font-semibold text-white transition-colors hover:bg-[#0903e8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4CEFF]/70 disabled:opacity-45"><Download className="size-3.5" strokeWidth={1.5} />{saving ? 'Preparing ZIP…' : 'Download all edited photos'}</button>
    </div>
    {message ? <p className="mt-3 text-caption text-[#C4CEFF]" role="status">{message}</p> : null}
  </div>
}
