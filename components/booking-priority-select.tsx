'use client'

type Props = {
  priority: number | null
  maxPriority: number
  className?: string
  disabled?: boolean
  onChange: (priority: number) => void | Promise<void>
}

/** Controlled queue-position selector. The parent owns persistence and row order. */
export default function BookingPrioritySelect({
  priority,
  maxPriority,
  className = '',
  disabled = false,
  onChange,
}: Props) {
  if (!priority || maxPriority < 1) {
    return (
      <span className={`text-caption text-white/35 font-semibold uppercase tracking-wider ${className}`}>
        —
      </span>
    )
  }

  return (
    <select
      data-client-priority-select="true"
      value={priority}
      disabled={disabled}
      onChange={(event) => void onChange(Number(event.target.value))}
      title="Move this client to another queue position"
      aria-label={`Queue position: Client ${priority} of ${maxPriority}`}
      className={`rounded-md border border-white/15 bg-black/40 px-2 py-1.5 text-caption font-semibold uppercase tracking-wider text-white focus:outline-none focus:border-primary/60 disabled:cursor-wait disabled:opacity-50 ${className}`}
    >
      {Array.from({ length: maxPriority }, (_, index) => index + 1).map((position) => (
        <option key={position} value={position}>
          Client {position}
        </option>
      ))}
    </select>
  )
}
