import { promises as fs } from 'fs'
import path from 'path'
import type { FicoSpotBlock } from '@/lib/fico-spot-blocks'
import { FICO_DAILY_LIMIT } from '@/lib/booking-slots'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { isSupabaseConfigured } from '@/lib/supabase/env'

const FILE_PATH = path.join(process.cwd(), 'data', 'fico-spot-blocks.json')

async function readFileBlocks(): Promise<FicoSpotBlock[]> {
  try {
    const raw = await fs.readFile(FILE_PATH, 'utf-8')
    return JSON.parse(raw) as FicoSpotBlock[]
  } catch {
    return []
  }
}

async function writeFileBlocks(blocks: FicoSpotBlock[]): Promise<void> {
  await fs.mkdir(path.dirname(FILE_PATH), { recursive: true })
  await fs.writeFile(FILE_PATH, JSON.stringify(blocks, null, 2), 'utf-8')
}

function mapRow(row: Record<string, unknown>): FicoSpotBlock {
  return {
    date: String(row.date).slice(0, 10),
    spotsBlocked: Math.min(
      FICO_DAILY_LIMIT,
      Math.max(0, Number(row.spots_blocked ?? row.spotsBlocked ?? 0)),
    ),
    reason: String(row.reason ?? ''),
    createdAt: String(row.created_at ?? row.createdAt ?? new Date().toISOString()),
    createdBy: row.created_by ? String(row.created_by) : row.createdBy ? String(row.createdBy) : undefined,
  }
}

export async function listFicoSpotBlocks(): Promise<FicoSpotBlock[]> {
  if (isSupabaseConfigured()) {
    const admin = getSupabaseAdmin()
    if (admin) {
      const { data, error } = await admin
        .from('fico_spot_blocks')
        .select('*')
        .order('date', { ascending: true })

      if (!error && data) return data.map((r) => mapRow(r as Record<string, unknown>))
      if (error?.message?.includes('fico_spot_blocks')) {
        console.warn('fico_spot_blocks table missing — run migration 008')
      }
    }
  }
  return readFileBlocks()
}

export async function upsertFicoSpotBlock(block: FicoSpotBlock): Promise<FicoSpotBlock | null> {
  const spotsBlocked = Math.min(FICO_DAILY_LIMIT, Math.max(0, block.spotsBlocked))

  if (spotsBlocked === 0) {
    await removeFicoSpotBlock(block.date)
    return null
  }

  const normalized = { ...block, spotsBlocked }

  if (isSupabaseConfigured()) {
    const admin = getSupabaseAdmin()
    if (admin) {
      const { data, error } = await admin
        .from('fico_spot_blocks')
        .upsert(
          {
            date: normalized.date,
            spots_blocked: normalized.spotsBlocked,
            reason: normalized.reason,
            created_by: normalized.createdBy ?? null,
          },
          { onConflict: 'date' },
        )
        .select()
        .single()

      if (!error && data) return mapRow(data as Record<string, unknown>)
      if (error) throw new Error(error.message)
    }
  }

  const blocks = await readFileBlocks()
  const idx = blocks.findIndex((b) => b.date === normalized.date)
  if (idx >= 0) blocks[idx] = normalized
  else blocks.push(normalized)
  blocks.sort((a, b) => a.date.localeCompare(b.date))
  await writeFileBlocks(blocks)
  return normalized
}

export async function removeFicoSpotBlock(date: string): Promise<boolean> {
  if (isSupabaseConfigured()) {
    const admin = getSupabaseAdmin()
    if (admin) {
      const { error } = await admin.from('fico_spot_blocks').delete().eq('date', date)
      if (!error) return true
      if (error) throw new Error(error.message)
    }
  }

  const blocks = await readFileBlocks()
  const next = blocks.filter((b) => b.date !== date)
  if (next.length === blocks.length) return false
  await writeFileBlocks(next)
  return true
}
