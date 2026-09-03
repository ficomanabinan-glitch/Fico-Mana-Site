'use client'

type Props = {
  priority: number | null
  maxPriority: number
  className?: string
}

/** Displays auto-assigned client number for the day (earliest booking time = Client 1). */
export default function BookingPrioritySelect({ priority, maxPriority, className = '' }: Props) {
  if (!priority || maxPriority < 1) {
    return (
      <span className={`text-[10px] text-white/35 font-semibold uppercase tracking-wider ${className}`}>
        —
      </span>
    )
  }

  const options = Array.from({ length: maxPriority }, (_, i) => i + 1)

  return (
    <select
      value={priority}
      disabled
      title="Auto-assigned from booking time — earliest session is Client 1"
      aria-label={`Client ${priority} of ${maxPriority}`}
      className={`rounded-md border border-white/15 bg-black/40 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white disabled:opacity-100 disabled:cursor-default focus:outline-none ${className}`}
    >
      {options.map((n) => (
        <option key={n} value={n}>
          Client {n}
        </option>
      ))}
    </select>
  )
}
