'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

export default function ReceiptUploadEnhancer() {
  const [host, setHost] = useState<HTMLElement | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')

  useEffect(() => {
    let input: HTMLInputElement | null = null
    let objectUrl: string | null = null

    const attach = () => {
      const candidate = document.querySelector<HTMLInputElement>(
        'input[type="file"][data-receipt-upload="true"]',
      )
      if (!candidate || candidate === input) return

      input = candidate
      input.accept = 'image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif'
      const parent = input.parentElement
      if (parent) setHost(parent)

      const onChange = () => {
        const file = input?.files?.[0]
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl)
          objectUrl = null
        }

        if (!file) {
          setPreviewUrl(null)
          setFileName('')
          return
        }

        if (!ALLOWED_TYPES.has(file.type)) {
          if (input) input.value = ''
          setPreviewUrl(null)
          setFileName('')
          window.alert('Please upload a receipt image only: JPG, PNG, WEBP, or GIF.')
          return
        }

        objectUrl = URL.createObjectURL(file)
        setPreviewUrl(objectUrl)
        setFileName(file.name)
      }

      input.addEventListener('change', onChange)
      return () => input?.removeEventListener('change', onChange)
    }

    let cleanupInput = attach()
    const observer = new MutationObserver(() => {
      if (!input?.isConnected) {
        cleanupInput?.()
        input = null
        setHost(null)
        cleanupInput = attach()
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
      cleanupInput?.()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [])

  if (!host || !previewUrl) return null

  return createPortal(
    <div className="mt-4 overflow-hidden border border-white/15 bg-black/30 text-left pointer-events-none">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={previewUrl} alt="Selected payment receipt preview" className="w-full max-h-72 object-contain bg-black/50" />
      <div className="px-3 py-2 border-t border-white/10">
        <p className="text-[10px] uppercase tracking-wider text-white/40">Receipt preview</p>
        <p className="text-xs text-white/70 truncate mt-0.5">{fileName}</p>
      </div>
    </div>,
    host,
  )
}
