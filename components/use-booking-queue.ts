'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Booking } from '@/lib/data-store'
import { buildDayPriorityMap, isPriorityEligible } from '@/lib/booking-priority'
import { useAdminToast } from '@/components/admin-toast-provider'

type PriorityUpdate = { bookingId: string; clientPriority: number }

const QUEUE_UPDATED_EVENT = 'booking-queue:updated'
let cachedPriorities: Map<string, number> | null = null
let pendingPriorityRead: Promise<Map<string, number>> | null = null

async function fetchSavedPriorities(force = false) {
  if (!force && cachedPriorities) return new Map(cachedPriorities)
  if (!force && pendingPriorityRead) return new Map(await pendingPriorityRead)

  pendingPriorityRead = (async () => {
    const response = await fetch('/api/bookings/client-priorities', {
      credentials: 'include',
      cache: 'no-store',
    })
    const body = (await response.json().catch(() => [])) as PriorityUpdate[] & { error?: string }
    if (!response.ok) throw new Error(body.error || 'Could not load the client queue.')
    const next = new Map<string, number>()
    for (const row of body) next.set(row.bookingId, row.clientPriority)
    cachedPriorities = next
    return next
  })()

  try {
    return new Map(await pendingPriorityRead)
  } finally {
    pendingPriorityRead = null
  }
}

function applyUpdates(base: Map<string, number>, updates: PriorityUpdate[]) {
  const next = new Map(base)
  for (const update of updates) next.set(update.bookingId, update.clientPriority)
  return next
}

export function optimisticQueueMove(
  bookings: Booking[],
  priorities: ReadonlyMap<string, number>,
  bookingId: string,
  destination: number,
) {
  const booking = bookings.find((item) => item.id === bookingId)
  if (!booking || !isPriorityEligible(booking)) return new Map(priorities)

  const day = bookings
    .filter((item) => item.bookingDate === booking.bookingDate && isPriorityEligible(item))
    .sort((left, right) => (priorities.get(left.id) ?? 9999) - (priorities.get(right.id) ?? 9999))
  const sourceIndex = day.findIndex((item) => item.id === bookingId)
  const destinationIndex = destination - 1
  if (sourceIndex < 0 || destinationIndex < 0 || destinationIndex >= day.length) return new Map(priorities)

  const reordered = [...day]
  const [moved] = reordered.splice(sourceIndex, 1)
  reordered.splice(destinationIndex, 0, moved)

  const next = new Map(priorities)
  reordered.forEach((item, index) => next.set(item.id, index + 1))
  return next
}

export function useBookingQueue(bookings: Booking[]) {
  const toast = useAdminToast()
  const [savedPriorities, setSavedPriorities] = useState<Map<string, number>>(
    () => new Map(cachedPriorities ?? []),
  )
  const [savingBookingId, setSavingBookingId] = useState<string | null>(null)
  const latestRef = useRef(savedPriorities)
  latestRef.current = savedPriorities

  const refresh = useCallback(async (force = false) => {
    try {
      const next = await fetchSavedPriorities(force)
      latestRef.current = next
      setSavedPriorities(next)
    } catch (error) {
      toast.error('Client queue unavailable', error instanceof Error ? error.message : 'Try refreshing the page.')
    }
  }, [toast])

  useEffect(() => { void refresh() }, [refresh])

  useEffect(() => {
    const handleUpdated = (event: Event) => {
      const updates = (event as CustomEvent<PriorityUpdate[]>).detail
      if (!Array.isArray(updates)) return
      setSavedPriorities((current) => {
        const next = applyUpdates(current, updates)
        cachedPriorities = next
        latestRef.current = next
        return next
      })
    }
    const handleSync = () => void refresh(true)
    window.addEventListener(QUEUE_UPDATED_EVENT, handleUpdated)
    window.addEventListener('admin:db-synced', handleSync)
    return () => {
      window.removeEventListener(QUEUE_UPDATED_EVENT, handleUpdated)
      window.removeEventListener('admin:db-synced', handleSync)
    }
  }, [refresh])

  const priorityMap = useMemo(
    () => buildDayPriorityMap(bookings, savedPriorities),
    [bookings, savedPriorities],
  )

  const moveBooking = useCallback(async (bookingId: string, destination: number) => {
    if (savingBookingId) return
    const currentMap = buildDayPriorityMap(bookings, latestRef.current)
    const previousPriority = currentMap.get(bookingId)
    if (!previousPriority || previousPriority === destination) return

    const previous = new Map(latestRef.current)
    const optimistic = optimisticQueueMove(bookings, currentMap, bookingId, destination)
    latestRef.current = optimistic
    cachedPriorities = optimistic
    setSavedPriorities(optimistic)
    setSavingBookingId(bookingId)

    try {
      const response = await fetch('/api/bookings/client-priorities', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, priority: destination, previousPriority }),
      })
      const body = (await response.json().catch(() => ({}))) as { error?: string; updates?: PriorityUpdate[] }
      if (!response.ok || !body.updates?.length) {
        throw new Error(body.error || 'The queue could not be saved.')
      }
      const confirmed = applyUpdates(previous, body.updates)
      cachedPriorities = confirmed
      latestRef.current = confirmed
      setSavedPriorities(confirmed)
      window.dispatchEvent(new CustomEvent(QUEUE_UPDATED_EVENT, { detail: body.updates }))
      toast.success('Client queue updated', `Moved to Client ${destination}.`)
    } catch (error) {
      cachedPriorities = previous
      latestRef.current = previous
      setSavedPriorities(previous)
      toast.error('Queue change was not saved', error instanceof Error ? error.message : 'Refresh and try again.')
      await refresh(true)
    } finally {
      setSavingBookingId(null)
    }
  }, [bookings, refresh, savingBookingId, toast])

  return { priorityMap, moveBooking, savingBookingId, refresh }
}
