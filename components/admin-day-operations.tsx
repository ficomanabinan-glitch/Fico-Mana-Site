'use client'

import { useEffect, useState } from 'react'
import { Ban, CheckCircle2, Loader2, Minus, Plus } from 'lucide-react'
import {
  FICO_DAILY_LIMIT,
  MANA_SESSION_BLOCKS,
  getFicoBookingCount,
  getMakeupSlotBookingCount,
  isMakeupSlotFull,
} from '@/lib/booking-slots'
import type { BlockedSlot } from '@/lib/blocked-slots'
import { getBlockedSlot } from '@/lib/blocked-slots'
import { getFicoSpotBlock, type FicoSpotBlock } from '@/lib/fico-spot-blocks'
import { blockSlot, setFicoSpotBlock, unblockSlot, type Booking } from '@/lib/data-store'
import { adminBtnGhost, adminBtnPrimary, adminInput, adminPanel } from '@/lib/admin-ui'
import { useAdminToast } from '@/components/admin-toast-provider'
import { cn } from '@/lib/utils'

type Props = {
  date: string
  bookings: Booking[]
  blockedSlots: BlockedSlot[]
  ficoSpotBlocks: FicoSpotBlock[]
  onChanged: () => void
}

type Tab = 'fico' | 'mana'

export default function AdminDayOperations({ date, bookings, blockedSlots, ficoSpotBlocks, onChanged }: Props) {
  const toast = useAdminToast()
  const [tab, setTab] = useState<Tab>('fico')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [ficoSpotsDraft, setFicoSpotsDraft] = useState(0)
  const [ficoReasonDraft, setFicoReasonDraft] = useState('')
  const [savingFico, setSavingFico] = useState(false)
  const [showFicoReason, setShowFicoReason] = useState(false)

  const ficoHold = getFicoSpotBlock(ficoSpotBlocks, date)
  const ficoHeld = ficoHold?.spotsBlocked ?? 0
  const ficoBooked = getFicoBookingCount(bookings, date)
  const ficoBookable = FICO_DAILY_LIMIT - ficoHeld
  const ficoDirty = ficoSpotsDraft !== ficoHeld

  useEffect(() => {
    setFicoSpotsDraft(ficoHeld)
    setFicoReasonDraft(ficoHold?.reason ?? '')
    setShowFicoReason(Boolean(ficoHold?.reason))
  }, [date, ficoHeld, ficoHold?.reason])

  const label = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  const blockedCount = MANA_SESSION_BLOCKS.reduce(
    (n, block) => n + block.slots.filter((s) => getBlockedSlot(blockedSlots, date, s.id)).length,
    0,
  )

  const handleBlock = async (slotId: string) => {
    setSavingId(slotId)
    try {
      await blockSlot(date, slotId, 'Slot unavailable')
      toast.success('Slot blocked')
      onChanged()
    } catch (err) {
      toast.error('Could not block', err instanceof Error ? err.message : 'Try again.')
    } finally {
      setSavingId(null)
    }
  }

  const handleUnblock = async (slotId: string) => {
    setSavingId(slotId)
    try {
      const ok = await unblockSlot(date, slotId)
      if (!ok) throw new Error('Slot was not blocked.')
      toast.success('Slot reopened')
      onChanged()
    } catch (err) {
      toast.error('Could not reopen', err instanceof Error ? err.message : 'Try again.')
    } finally {
      setSavingId(null)
    }
  }

  const handleSaveFicoHold = async () => {
    setSavingFico(true)
    try {
      await setFicoSpotBlock(
        date,
        ficoSpotsDraft,
        ficoReasonDraft.trim() || 'Held by studio',
      )
      toast.success(
        ficoSpotsDraft === 0 ? 'FICO capacity restored' : `${ficoSpotsDraft} spot${ficoSpotsDraft === 1 ? '' : 's'} held`,
      )
      onChanged()
    } catch (err) {
      toast.error('Could not update', err instanceof Error ? err.message : 'Try again.')
    } finally {
      setSavingFico(false)
    }
  }

  const adjustFico = (delta: number) => {
    setFicoSpotsDraft((n) => Math.min(FICO_DAILY_LIMIT, Math.max(0, n + delta)))
  }

  return (
    <div className={`${adminPanel} overflow-hidden`}>
      <div className="p-5 border-b border-white/10 bg-white/[0.03]">
        <p className="text-[10px] font-bold tracking-[0.16em] text-white/40 uppercase">Manage day</p>
        <p className="text-lg font-semibold text-white mt-1">{label}</p>
        <p className="text-xs text-white/50 mt-1">
          Reduce FICO spots or block MANA slots — the studio can stay open either way.
        </p>
      </div>

      <div className="flex border-b border-white/10">
        {(
          [
            { id: 'fico' as const, label: 'FICO spots', hint: `${ficoBooked}/${FICO_DAILY_LIMIT} booked · ${ficoBookable} hold room` },
            { id: 'mana' as const, label: 'MANA slots', hint: blockedCount > 0 ? `${blockedCount} blocked` : 'Shows client bookings' },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              'flex-1 px-4 py-3 text-left transition-colors border-b-2 -mb-px',
              tab === item.id
                ? 'border-primary bg-primary/5 text-white'
                : 'border-transparent text-white/50 hover:text-white/80 hover:bg-white/[0.02]',
            )}
          >
            <span className="block text-xs font-semibold">{item.label}</span>
            <span className="block text-[10px] text-white/40 mt-0.5">{item.hint}</span>
          </button>
        ))}
      </div>

      <div className="p-5">
        {tab === 'fico' ? (
          <div className="space-y-5">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-end justify-between gap-4 mb-4">
                <div>
                  <p className="text-xs text-white/50">Customer bookable today</p>
                  <p className="text-3xl font-bold text-white tabular-nums mt-1">
                    {FICO_DAILY_LIMIT - ficoSpotsDraft}
                    <span className="text-base font-medium text-white/40"> / {FICO_DAILY_LIMIT}</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-white/50">Studio holds</p>
                  <p className="text-3xl font-bold text-violet-300 tabular-nums mt-1">{ficoSpotsDraft}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 mb-4">
                {Array.from({ length: FICO_DAILY_LIMIT }, (_, i) => {
                  const held = i < ficoSpotsDraft
                  return (
                    <div
                      key={i}
                      className={cn(
                        'h-2.5 flex-1 min-w-[16px] rounded-sm transition-colors',
                        held ? 'bg-violet-500/70' : 'bg-primary/40',
                      )}
                      title={held ? 'Held by studio' : 'Bookable'}
                    />
                  )
                })}
              </div>

              <div className="flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => adjustFico(-1)}
                  disabled={ficoSpotsDraft === 0}
                  className="w-10 h-10 rounded-lg border border-white/15 bg-white/[0.04] text-white flex items-center justify-center hover:bg-white/[0.08] disabled:opacity-30 transition-colors"
                  aria-label="Hold one fewer spot"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="w-12 text-center text-sm font-semibold text-white tabular-nums">
                  {ficoSpotsDraft}
                </span>
                <button
                  type="button"
                  onClick={() => adjustFico(1)}
                  disabled={ficoSpotsDraft === FICO_DAILY_LIMIT}
                  className="w-10 h-10 rounded-lg border border-white/15 bg-white/[0.04] text-white flex items-center justify-center hover:bg-white/[0.08] disabled:opacity-30 transition-colors"
                  aria-label="Hold one more spot"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              <div className="flex flex-wrap gap-2 justify-center mt-4">
                {[0, 1, 2, FICO_DAILY_LIMIT].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setFicoSpotsDraft(n)}
                    className={cn(
                      'px-3 py-1.5 rounded-md text-[11px] font-medium border transition-colors',
                      ficoSpotsDraft === n
                        ? 'border-primary/50 bg-primary/15 text-white'
                        : 'border-white/10 text-white/55 hover:border-white/20 hover:text-white',
                    )}
                  >
                    {n === 0 ? 'None' : n === FICO_DAILY_LIMIT ? 'All' : `${n} held`}
                  </button>
                ))}
              </div>
            </div>

            {showFicoReason ? (
              <input
                value={ficoReasonDraft}
                onChange={(e) => setFicoReasonDraft(e.target.value)}
                placeholder="Note for staff (optional)"
                className={adminInput}
              />
            ) : (
              <button
                type="button"
                onClick={() => setShowFicoReason(true)}
                className="text-[11px] text-white/40 hover:text-white/70 transition-colors"
              >
                + Add a note
              </button>
            )}

            <button
              type="button"
              onClick={handleSaveFicoHold}
              disabled={savingFico || !ficoDirty}
              className={cn(
                'w-full py-3 text-xs font-bold uppercase tracking-wider',
                adminBtnPrimary,
                !ficoDirty && 'opacity-40',
              )}
            >
              {savingFico ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…
                </span>
              ) : ficoSpotsDraft === 0 ? (
                'Clear hold'
              ) : (
                `Hold ${ficoSpotsDraft} spot${ficoSpotsDraft === 1 ? '' : 's'}`
              )}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-white/50 leading-relaxed">
              Client bookings occupy each Slot 1 / Slot 2 (no double booking).
              Tap Block only for extra studio holds.
            </p>

            {MANA_SESSION_BLOCKS.map((block) => (
              <div key={block.sessionId}>
                <p className="text-[11px] font-semibold text-white/70 mb-2">{block.timeLabel}</p>
                <div className="rounded-xl border border-white/10 overflow-hidden divide-y divide-white/[0.06]">
                  {block.slots.map((slot) => {
                    const blocked = getBlockedSlot(blockedSlots, date, slot.id)
                    const booked = getMakeupSlotBookingCount(bookings, date, slot.id)
                    const full = isMakeupSlotFull(bookings, date, slot.id)
                    const saving = savingId === slot.id
                    return (
                      <div
                        key={slot.id}
                        className={cn(
                          'flex items-center justify-between gap-3 px-4 py-3',
                          blocked
                            ? 'bg-amber-500/[0.07]'
                            : full
                              ? 'bg-red-500/[0.07]'
                              : booked > 0
                                ? 'bg-primary/[0.06]'
                                : 'bg-white/[0.02]',
                        )}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-white">{slot.slotLabel}</p>
                          <p className="text-[11px] text-white/45 mt-0.5">
                            {booked > 0 ? 'Client booked' : 'Available'}
                            {blocked?.reason && blocked.reason !== 'Slot unavailable'
                              ? ` · ${blocked.reason}`
                              : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={cn(
                              'text-[10px] font-semibold uppercase px-2 py-0.5 rounded',
                              blocked
                                ? 'bg-amber-500/20 text-amber-300'
                                : full
                                  ? 'bg-red-500/20 text-red-300'
                                  : booked > 0
                                    ? 'bg-primary/20 text-primary'
                                    : 'bg-emerald-500/15 text-emerald-400',
                            )}
                          >
                            {blocked ? 'Blocked' : full ? 'Full' : booked > 0 ? 'Booked' : 'Open'}
                          </span>
                          {blocked ? (
                            <button
                              type="button"
                              onClick={() => handleUnblock(slot.id)}
                              disabled={saving}
                              className={cn('px-3 py-2 text-[10px]', adminBtnGhost)}
                            >
                              {saving ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <>
                                  <CheckCircle2 className="w-3 h-3 inline mr-1" />
                                  Reopen
                                </>
                              )}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleBlock(slot.id)}
                              disabled={saving || full}
                              className="px-3 py-2 rounded-lg border border-amber-500/30 bg-amber-500/10 text-[10px] font-bold uppercase tracking-wider text-amber-200 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
                            >
                              {saving ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <>
                                  <Ban className="w-3 h-3 inline mr-1" />
                                  Block
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
