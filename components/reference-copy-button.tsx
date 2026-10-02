'use client'

import { useState } from 'react'
import { Copy } from 'lucide-react'

/** Clipboard denial is recoverable: the caller keeps the reference visible above this control. */
export default function ReferenceCopyButton({ value, label }: { value: string; label: string }) {
  const [state, setState] = useState<'idle' | 'copying' | 'copied' | 'failed'>('idle')
  const copy = async () => {
    setState('copying')
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(value)
      setState('copied')
    } catch {
      setState('failed')
    }
  }
  return <>
    <button type="button" disabled={state === 'copying'} onClick={() => void copy()} className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-control px-2 text-caption text-white disabled:opacity-60">
      <Copy className="size-3" aria-hidden="true" />
      {state === 'copying' ? 'Copying…' : state === 'copied' ? 'Copied!' : label}
    </button>
    {state === 'failed' ? <p role="alert" aria-label={`${label} problem`} className="mt-1 text-caption text-public-muted">Couldn’t copy automatically. Select and copy the reference above.</p> : null}
  </>
}
