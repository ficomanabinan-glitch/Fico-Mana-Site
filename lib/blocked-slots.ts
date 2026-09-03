export type BlockedSlot = {
  date: string // YYYY-MM-DD
  slotId: string // e.g. m-08-10-s1
  reason: string
  createdAt: string
  createdBy?: string
}

export function getBlockedSlotsForDate(blockedSlots: BlockedSlot[], dateKey: string): BlockedSlot[] {
  return blockedSlots.filter((b) => b.date === dateKey)
}

export function isSlotBlocked(
  blockedSlots: BlockedSlot[],
  dateKey: string,
  slotId: string,
): boolean {
  return blockedSlots.some((b) => b.date === dateKey && b.slotId === slotId)
}

export function getBlockedSlot(
  blockedSlots: BlockedSlot[],
  dateKey: string,
  slotId: string,
): BlockedSlot | undefined {
  return blockedSlots.find((b) => b.date === dateKey && b.slotId === slotId)
}

export function countBlockedSlotsOnDate(blockedSlots: BlockedSlot[], dateKey: string): number {
  return getBlockedSlotsForDate(blockedSlots, dateKey).length
}
