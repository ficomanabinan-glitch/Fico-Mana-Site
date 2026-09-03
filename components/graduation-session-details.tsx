import type { Booking } from '@/lib/data-store'

export function GraduationSessionDetails({ booking }: { booking: Booking }) {
  const hasGraduationDetails =
    booking.schoolName ||
    booking.course ||
    booking.hoodColor ||
    booking.togaColor ||
    booking.tasselColor ||
    booking.backgroundColor

  if (!hasGraduationDetails) return null

  const rows = [
    ['School', booking.schoolName],
    ['Course', booking.course],
    ['Hood', booking.hoodColor],
    ['Toga', booking.togaColor],
    ['Tassel', booking.tasselColor],
    ['Background', booking.backgroundColor],
  ].filter(([, value]) => value)

  return (
    <div className="col-span-2 border-t border-white/10 pt-3 mt-1">
      <p className="text-white/40 font-medium text-[8px] uppercase tracking-wider mb-2">Graduation Session Details</p>
      <div className="grid sm:grid-cols-2 gap-2">
        {rows.map(([label, value]) => (
          <div key={label} className="bg-white/[0.03] border border-white/10 px-3 py-2">
            <p className="text-[9px] uppercase tracking-wider text-primary">{label}</p>
            <p className="text-xs font-semibold text-white/90 mt-0.5">{value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
