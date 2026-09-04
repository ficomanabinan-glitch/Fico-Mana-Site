'use client'

type Props = {
  priority: number | null
  maxPriority: number
  className?: string
  disabled?: boolean
  onChange?: (priority: number) => void
}

/** Staff-controlled studio arrival order for a shoot day. */
export default function BookingPrioritySelect({
  priority,
  maxPriority,
  className = '',
  disabled = false,
  onChange,
}: Props) {
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
      disabled={disabled}
      onChange={(event) => onChange?.(Number(event.target.value))}
      title="Set studio arrival order"
      aria-label={`Studio arrival order: Client ${priority} of ${maxPriority}`}
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
