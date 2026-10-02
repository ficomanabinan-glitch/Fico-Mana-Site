'use client'

import { useEffect, useRef, type ReactNode } from 'react'

/** Native modal focus/inert/Escape behavior without changing existing payment forms. */
export default function StaffModalFrame({ children, className, labelledBy, onClose }: {
  children: ReactNode; className: string; labelledBy: string; onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (element && !element.open) element.showModal()
    // Chrome may initially focus an implicitly focusable scroll container,
    // then drop that focus when async contents replace its loading skeleton.
    // Prefer a stable control, while preserving explicit native autofocus.
    const controls = '[autofocus], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]'
    const active = document.activeElement
    if (element?.open && (!element.contains(active) || !active?.matches(controls))) {
      const firstControl = element.querySelector<HTMLElement>(controls)
      const focusTarget = firstControl ?? element
      focusTarget.focus({ preventScroll: true })
    }
    return () => {
      if (element?.open) element.close()
      // React may remove the dialog before native close restores a nested opener.
      if (opener?.isConnected) opener.focus({ preventScroll: true })
    }
  }, [])
  return <dialog ref={dialog} tabIndex={-1} aria-labelledby={labelledBy} aria-modal="true" onCancel={event => { event.preventDefault(); onClose() }} className={`${className} m-0 h-dvh w-screen max-w-none max-h-none border-0 text-white [&_button]:min-h-11 [&_button]:min-w-11 [&::backdrop]:bg-black/50`}>{children}</dialog>
}
