'use client'

import { useEffect, useRef, useState } from 'react'
import { useAdminToast } from '@/components/admin-toast-provider'

type Props = {
  priority: number | null
  maxPriority: number
  className?: string
  disabled?: boolean
  onChange?: (priority: number) => void
}

type PriorityRow = {
  bookingId: string
  bookingDate: string
  clientPriority: number
}

type PriorityUpdate = {
  bookingId: string
  clientPriority: number
}

let savedPriorities: Map<string, number> | null = null
let savedPrioritiesPromise: Promise<Map<string, number>> | null = null

async function loadSavedPriorities() {
  if (savedPriorities) return savedPriorities
  if (savedPrioritiesPromise) return savedPrioritiesPromise

  savedPrioritiesPromise = (async () => {
    try {
      const res = await fetch('/api/bookings/client-priorities', {
        cache: 'no-store',
        credentials: 'include',
      })
      if (!res.ok) return new Map<string, number>()
      const rows = (await res.json()) as PriorityRow[]
      savedPriorities = new Map(
        rows
          .filter((row) => Number.isInteger(row.clientPriority) && row.clientPriority >= 1)
          .map((row) => [row.bookingId, row.clientPriority]),
      )
      return savedPriorities
    } catch (error) {
      console.error('Failed to load client priorities:', error)
      return new Map<string, number>()
    } finally {
      savedPrioritiesPromise = null
    }
  })()

  return savedPrioritiesPromise
}

function bookingIdFromSelect(select: HTMLSelectElement | null) {
  let node: HTMLElement | null = select
  for (let depth = 0; node && depth < 5; depth += 1) {
    const link = node.querySelector<HTMLAnchorElement>('a[href*="/admin/bookings?search="]')
    if (link) {
      try {
        return new URL(link.href, window.location.origin).searchParams.get('search')
      } catch {
        return null
      }
    }
    node = node.parentElement
  }
  return null
}

function applyVisualOrder(select: HTMLSelectElement | null, priority: number) {
  if (!select) return
  const row = select.parentElement?.parentElement?.parentElement as HTMLElement | null
  const list = row?.parentElement as HTMLElement | null
  if (!row || !list) return

  list.style.display = 'flex'
  list.style.flexDirection = 'column'
  row.style.order = String(priority)
}

/** Staff-controlled studio arrival order for a shoot day. */
export default function BookingPrioritySelect({
  priority,
  maxPriority,
  className = '',
  disabled = false,
  onChange,
}: Props) {
  const toast = useAdminToast()
  const selectRef = useRef<HTMLSelectElement>(null)
  const [bookingId, setBookingId] = useState<string | null>(null)
  const [displayPriority, setDisplayPriority] = useState(priority)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDisplayPriority(priority)
  }, [priority])

  useEffect(() => {
    const id = bookingIdFromSelect(selectRef.current)
    if (!id) return
    setBookingId(id)

    let cancelled = false
    void loadSavedPriorities().then((map) => {
      if (cancelled) return
      const saved = map.get(id)
      if (saved && saved <= maxPriority) setDisplayPriority(saved)
    })

    return () => {
      cancelled = true
    }
  }, [maxPriority])

  useEffect(() => {
    if (displayPriority) applyVisualOrder(selectRef.current, displayPriority)
  }, [displayPriority])

  useEffect(() => {
    const handleUpdate = (event: Event) => {
      const detail = (event as CustomEvent<PriorityUpdate[]>).detail
      if (!bookingId || !Array.isArray(detail)) return
      const update = detail.find((item) => item.bookingId === bookingId)
      if (update) setDisplayPriority(update.clientPriority)
    }

    window.addEventListener('client-priority-updated', handleUpdate)
    return () => window.removeEventListener('client-priority-updated', handleUpdate)
  }, [bookingId])

  if (!displayPriority || maxPriority < 1) {
    return (
      <span className={`text-[10px] text-white/35 font-semibold uppercase tracking-wider ${className}`}>
        —
      </span>
    )
  }

  const options = Array.from({ length: maxPriority }, (_, i) => i + 1)

  const updatePriority = async (nextPriority: number) => {
    const currentPriority = displayPriority
    const currentSelect = selectRef.current
    const currentBookingId = bookingId || bookingIdFromSelect(currentSelect)

    if (!currentBookingId || nextPriority === currentPriority) return

    const dayList = currentSelect?.closest('.divide-y') || currentSelect?.parentElement?.parentElement?.parentElement?.parentElement
    const selects = Array.from(
      dayList?.querySelectorAll<HTMLSelectElement>('select[data-client-priority-select="true"]') ?? [],
    )
    const swapSelect = selects.find(
      (item) => item !== currentSelect && Number(item.value) === nextPriority,
    )
    const swapBookingId = bookingIdFromSelect(swapSelect ?? null)

    setSaving(true)
    setDisplayPriority(nextPriority)
    if (swapSelect && swapBookingId) {
      window.dispatchEvent(
        new CustomEvent<PriorityUpdate[]>('client-priority-updated', {
          detail: [
            { bookingId: currentBookingId, clientPriority: nextPriority },
            { bookingId: swapBookingId, clientPriority: currentPriority },
          ],
        }),
      )
    }

    try {
      const res = await fetch('/api/bookings/client-priorities', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: currentBookingId,
          priority: nextPriority,
          previousPriority: currentPriority,
          swapBookingId,
        }),
      })
      const body = (await res.json().catch(() => ({}))) as {
        error?: string
        updates?: PriorityUpdate[]
      }
      if (!res.ok) throw new Error(body.error || 'Could not save client order.')

      const updates = body.updates ?? [
        { bookingId: currentBookingId, clientPriority: nextPriority },
        ...(swapBookingId
          ? [{ bookingId: swapBookingId, clientPriority: currentPriority }]
          : []),
      ]

      if (!savedPriorities) savedPriorities = new Map()
      for (const update of updates) savedPriorities.set(update.bookingId, update.clientPriority)

      window.dispatchEvent(
        new CustomEvent<PriorityUpdate[]>('client-priority-updated', { detail: updates }),
      )
      onChange?.(nextPriority)
      toast.success('Client order updated', `Assigned ${currentBookingId} as Client ${nextPriority}.`)
    } catch (error) {
      setDisplayPriority(currentPriority)
      window.dispatchEvent(
        new CustomEvent<PriorityUpdate[]>('client-priority-updated', {
          detail: [
            { bookingId: currentBookingId, clientPriority: currentPriority },
            ...(swapBookingId
              ? [{ bookingId: swapBookingId, clientPriority: nextPriority }]
              : []),
          ],
        }),
      )
      toast.error(
        'Client order not saved',
        error instanceof Error ? error.message : 'Could not update studio arrival order.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <select
      ref={selectRef}
      data-client-priority-select="true"
      value={displayPriority}
      disabled={disabled || saving}
      onChange={(event) => void updatePriority(Number(event.target.value))}
      title="Set who arrived first in the studio"
      aria-label={`Studio arrival order: Client ${displayPriority} of ${maxPriority}`}
      className={`rounded-md border border-white/15 bg-black/40 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white focus:outline-none focus:border-primary/60 disabled:opacity-50 disabled:cursor-wait ${className}`}
    >
      {options.map((n) => (
        <option key={n} value={n}>
          Client {n}
        </option>
      ))}
    </select>
  )
}
