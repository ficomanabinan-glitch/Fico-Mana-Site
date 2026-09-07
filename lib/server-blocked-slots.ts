import { promises as fs } from 'fs'
import path from 'path'
import type { BlockedSlot } from '@/lib/blocked-slots'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { isSupabaseConfigured } from '@/lib/supabase/env'

const FILE_PATH = path.join(process.cwd(), 'data', 'blocked-slots.json')

async function readFileBlockedSlots(): Promise<BlockedSlot[]> {
  try {
    const raw = await fs.readFile(FILE_PATH, 'utf-8')
    return JSON.parse(raw) as BlockedSlot[]
  } catch {
    return []
  }
}

async function writeFileBlockedSlots(slots: BlockedSlot[]): Promise<void> {
  await fs.mkdir(path.dirname(FILE_PATH), { recursive: true })
  await fs.writeFile(FILE_PATH, JSON.stringify(slots, null, 2), 'utf-8')
}

function mapRow(row: Record<string, unknown>): BlockedSlot {
  return {
    date: String(row.date).slice(0, 10),
    slotId: String(row.slot_id ?? row.slotId),
    reason: String(row.reason ?? ''),
    createdAt: String(row.created_at ?? row.createdAt ?? new Date().toISOString()),
    createdBy: row.created_by ? String(row.created_by) : row.createdBy ? String(row.createdBy) : undefined,
  }
}

function requireSupabaseAdmin() {
  const admin = getSupabaseAdmin()
  if (!admin) {
    throw new Error(
      'Schedule settings are unavailable. Try: ask your administrator to check the connection.',
    )
  }
  return admin
}

export async function listBlockedSlots(): Promise<BlockedSlot[]> {
  if (isSupabaseConfigured()) {
    const admin = requireSupabaseAdmin()
    const { data, error } = await admin
      .from('blocked_slots')
      .select('*')
      .order('date', { ascending: true })

    if (error) throw new Error(error.message)
    return (data ?? []).map((r) => mapRow(r as Record<string, unknown>))
  }

  return readFileBlockedSlots()
}

export async function upsertBlockedSlot(slot: BlockedSlot): Promise<BlockedSlot> {
  if (isSupabaseConfigured()) {
    const admin = requireSupabaseAdmin()
    const { data, error } = await admin
      .from('blocked_slots')
      .upsert(
        {
          date: slot.date,
          slot_id: slot.slotId,
          reason: slot.reason,
          created_by: slot.createdBy ?? null,
        },
        { onConflict: 'date,slot_id' },
      )
      .select()
      .single()

    if (error) throw new Error(error.message)
    if (!data) throw new Error('Blocked slot was not returned after save.')
    return mapRow(data as Record<string, unknown>)
  }

  const slots = await readFileBlockedSlots()
  const idx = slots.findIndex((s) => s.date === slot.date && s.slotId === slot.slotId)
  if (idx >= 0) slots[idx] = slot
  else slots.push(slot)
  slots.sort((a, b) => a.date.localeCompare(b.date) || a.slotId.localeCompare(b.slotId))
  await writeFileBlockedSlots(slots)
  return slot
}

export async function removeBlockedSlot(date: string, slotId: string): Promise<boolean> {
  if (isSupabaseConfigured()) {
    const admin = requireSupabaseAdmin()
    const { error } = await admin
      .from('blocked_slots')
      .delete()
      .eq('date', date)
      .eq('slot_id', slotId)

    if (error) throw new Error(error.message)
    return true
  }

  const slots = await readFileBlockedSlots()
  const next = slots.filter((s) => !(s.date === date && s.slotId === slotId))
  if (next.length === slots.length) return false
  await writeFileBlockedSlots(next)
  return true
}
