import { FICO_DAILY_LIMIT } from '@/lib/booking-slots'

export type FicoSpotBlock = {
  date: string // YYYY-MM-DD
  spotsBlocked: number // 0–FICO_DAILY_LIMIT spots held by admin
  reason: string
  createdAt: string
  createdBy?: string
}

export function getFicoSpotBlock(
  blocks: FicoSpotBlock[],
  dateKey: string,
): FicoSpotBlock | undefined {
  return blocks.find((b) => b.date === dateKey)
}

export function getFicoSpotsBlocked(blocks: FicoSpotBlock[], dateKey: string): number {
  const row = getFicoSpotBlock(blocks, dateKey)
  if (!row) return 0
  return Math.min(FICO_DAILY_LIMIT, Math.max(0, row.spotsBlocked))
}

/** How many FICO bookings can still be accepted on this date. */
export function getFicoBookableLimit(blocks: FicoSpotBlock[], dateKey: string): number {
  return Math.max(0, FICO_DAILY_LIMIT - getFicoSpotsBlocked(blocks, dateKey))
}
