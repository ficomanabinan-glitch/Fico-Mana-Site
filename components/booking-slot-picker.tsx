'use client'

import { cn } from '@/lib/utils'
import { MANA_SESSION_BLOCKS, type SessionSlot } from '@/lib/booking-slots'

type Props = {
  selectedSlotId: string
  onSelect: (slotId: string) => void
  isSlotFull: (slotId: string) => boolean
  isSlotBlocked?: (slotId: string) => boolean
}

function SlotButton({
  slot,
  selected,
  full,
  blocked,
  onSelect,
}: {
  slot: SessionSlot
  selected: boolean
  full: boolean
  blocked: boolean
  onSelect: () => void
}) {
  const unavailable = full || blocked

  return (
    <button
      type="button"
      disabled={unavailable}
      onClick={onSelect}
      className={cn(
        'w-full h-full min-h-[52px] sm:min-h-[58px] px-1.5 sm:px-2 py-2 border text-center transition-all duration-200 flex flex-col items-center justify-center gap-0.5',
        selected && 'border-white bg-white/15 text-white ring-1 ring-white/40',
        !selected &&
          !unavailable &&
          'border-white/12 bg-white/[0.03] text-white hover:border-white/40 hover:bg-white/5',
        unavailable && 'border-white/5 bg-white/[0.02] text-white/35 cursor-not-allowed',
        blocked && !full && 'border-amber-500/20 bg-amber-500/5',
      )}
    >
      <span className="text-[9px] sm:text-[10px] font-bold tracking-[0.12em] uppercase leading-none">
        {slot.slotLabel}
      </span>
      <span className="text-[7px] sm:text-[8px] text-white/60 leading-tight">
        {slot.arrivalTime} → {slot.shootTime}
      </span>
      <span
        className={cn(
          'text-[7px] uppercase tracking-wider font-semibold leading-none mt-0.5',
          blocked && !full ? 'text-amber-400/80' : full ? 'text-white/50' : selected ? 'text-white' : 'text-white/80',
        )}
      >
        {blocked && !full ? 'Blocked' : full ? 'Full' : selected ? 'Selected' : 'Open'}
      </span>
    </button>
  )
}

export default function BookingSlotPicker({
  selectedSlotId,
  onSelect,
  isSlotFull,
  isSlotBlocked,
}: Props) {
  return (
    <div className="flex flex-col min-h-0">
      <div className="min-w-[260px] sm:min-w-0">
        <div className="grid grid-cols-[minmax(0,1.15fr)_1fr_1fr] gap-1 sm:gap-1.5 mb-1.5 shrink-0">
          <div className="text-[8px] font-semibold tracking-[0.14em] uppercase text-white/30 px-1">
            Session
          </div>
          <div className="text-center text-[8px] font-bold tracking-[0.14em] uppercase py-1.5 border-b-2 text-white border-white">
            Slot 1
          </div>
          <div className="text-center text-[8px] font-bold tracking-[0.14em] uppercase py-1.5 border-b-2 text-white border-white">
            Slot 2
          </div>
        </div>

        <div className="space-y-1.5">
          {MANA_SESSION_BLOCKS.map((block) => {
            const sessionFull = block.slots.every(
              (slot) => isSlotFull(slot.id) || !!isSlotBlocked?.(slot.id),
            )

            return (
              <div
                key={block.sessionId}
                className={cn(
                  'grid grid-cols-[minmax(0,1.15fr)_1fr_1fr] gap-1 sm:gap-1.5 items-stretch',
                  sessionFull && 'opacity-60',
                )}
              >
                <div className="flex flex-col justify-center px-1 sm:px-1.5 py-2 border border-white/8 bg-white/[0.02]">
                  <p className="text-[8px] sm:text-[9px] font-medium leading-snug text-white/75 tracking-wide">
                    {block.timeLabel.replace(' - ', ' – ')}
                  </p>
                  {sessionFull && (
                    <p className="text-[7px] uppercase tracking-wider text-white/50 mt-1 font-semibold">
                      Session full
                    </p>
                  )}
                </div>
                {block.slots.map((slot) => (
                  <SlotButton
                    key={slot.id}
                    slot={slot}
                    selected={selectedSlotId === slot.id}
                    full={isSlotFull(slot.id)}
                    blocked={!!isSlotBlocked?.(slot.id)}
                    onSelect={() => onSelect(slot.id)}
                  />
                ))}
              </div>
            )
          })}
        </div>

        <p className="text-[9px] text-white/40 leading-snug border-t border-white/8 pt-3 mt-3">
          With makeup · 1 booking per slot · Arrive 15 min early
        </p>
      </div>
    </div>
  )
}
