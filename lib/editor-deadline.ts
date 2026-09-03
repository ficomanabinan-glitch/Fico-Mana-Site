/** Editor turnaround: 12 working days (Mon–Fri). */
export const EDITOR_DEADLINE_DAYS = 12

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Parse YYYY-MM-DD as a local calendar day (avoids UTC shift). */
export function parseLocalDateKey(dateKey: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey.trim())
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}

export function isWeekend(d: Date): boolean {
  const day = d.getDay()
  return day === 0 || day === 6
}

/** If the date falls on Sat/Sun, move to the following Monday. */
export function toWorkingDayOrNext(d: Date): Date {
  const next = startOfLocalDay(d)
  while (isWeekend(next)) {
    next.setDate(next.getDate() + 1)
  }
  return next
}

/** Add N Mon–Fri days after `start` (start day itself is not counted). */
export function addWorkingDays(start: Date, days: number): Date {
  const d = startOfLocalDay(start)
  let added = 0
  while (added < days) {
    d.setDate(d.getDate() + 1)
    if (!isWeekend(d)) added += 1
  }
  return d
}

/**
 * Editor day folders group by shoot date (bookingDate).
 * All clients scheduled that day share one folder.
 */
export function getEditorFolderDayKey(booking: { bookingDate?: string }): string {
  return booking.bookingDate?.trim() || 'undated'
}

/**
 * Edit clock start:
 * - Default: the calendar day after the shoot (then snapped to next working day if weekend).
 * - If approval is later (late 5-pick / late approve), use approval day instead so the
 *   editor still gets a full 12 working days — late clients never shorten the edit window.
 */
export function getEditorDeadlineStart(booking: {
  bookingDate?: string
  rawPhotoApprovedAt?: string
  rawPhotoSubmittedAt?: string
}): Date | null {
  const approvalRaw = booking.rawPhotoApprovedAt || booking.rawPhotoSubmittedAt
  if (!approvalRaw) return null

  const approvalDay = startOfLocalDay(new Date(approvalRaw))
  if (Number.isNaN(approvalDay.getTime())) return null

  let dayAfterShoot: Date | null = null
  if (booking.bookingDate) {
    const shoot = parseLocalDateKey(booking.bookingDate)
    if (shoot) {
      dayAfterShoot = startOfLocalDay(shoot)
      dayAfterShoot.setDate(dayAfterShoot.getDate() + 1)
    }
  }

  // Later of (day after shoot) and (approval day) — never start before approval can begin work,
  // and never start on the shoot day itself when approval is on-time.
  const clock =
    dayAfterShoot && dayAfterShoot.getTime() > approvalDay.getTime() ? dayAfterShoot : approvalDay

  return toWorkingDayOrNext(clock)
}

export function getEditorDeadlineEnd(booking: {
  bookingDate?: string
  rawPhotoApprovedAt?: string
  rawPhotoSubmittedAt?: string
}): Date | null {
  const start = getEditorDeadlineStart(booking)
  if (!start) return null
  return addWorkingDays(start, EDITOR_DEADLINE_DAYS)
}

/** Working days from `from` (exclusive) through `to` (inclusive). Negative if past due. */
export function workingDaysUntil(from: Date, to: Date): number {
  const start = startOfLocalDay(from)
  const end = startOfLocalDay(to)
  if (start.getTime() === end.getTime()) return 0

  if (start.getTime() < end.getTime()) {
    let n = 0
    const c = new Date(start)
    while (c.getTime() < end.getTime()) {
      c.setDate(c.getDate() + 1)
      if (!isWeekend(c)) n += 1
    }
    return n
  }

  let n = 0
  const c = new Date(end)
  while (c.getTime() < start.getTime()) {
    c.setDate(c.getDate() + 1)
    if (!isWeekend(c)) n += 1
  }
  return -n
}

export function getEditorDeadlineInfo(booking: {
  editedPhotoLink?: string
  bookingDate?: string
  rawPhotoApprovedAt?: string
  rawPhotoSubmittedAt?: string
}): {
  start: Date | null
  end: Date | null
  daysLeft: number | null
  overdue: boolean
  delivered: boolean
  label: string
} {
  const delivered = Boolean(booking.editedPhotoLink)
  const start = getEditorDeadlineStart(booking)
  const end = getEditorDeadlineEnd(booking)
  if (!end) {
    return {
      start,
      end,
      daysLeft: null,
      overdue: false,
      delivered,
      label: delivered ? 'Delivered' : 'No deadline stamp',
    }
  }

  const daysLeft = workingDaysUntil(new Date(), end)
  const overdue = !delivered && daysLeft < 0

  let label: string
  if (delivered) label = 'Delivered'
  else if (overdue) label = `Overdue by ${Math.abs(daysLeft)}wd`
  else if (daysLeft === 0) label = 'Due today'
  else if (daysLeft === 1) label = '1 working day left'
  else label = `${daysLeft} working days left`

  return { start, end, daysLeft, overdue, delivered, label }
}
