import { NextResponse } from 'next/server'
import { ALL_MANA_SLOTS } from '@/lib/booking-slots'
import { requireStaffAuth } from '@/lib/auth-api'
import { listBlockedSlots, removeBlockedSlot, upsertBlockedSlot } from '@/lib/server-blocked-slots'

const VALID_SLOT_IDS = new Set(ALL_MANA_SLOTS.map((s) => s.id))

/** Public: blocked session slots. Staff: POST/DELETE to manage. */
export async function GET() {
  try {
    const slots = await listBlockedSlots()
    return NextResponse.json(slots)
  } catch (error) {
    console.error('GET /api/blocked-slots', error)
    return NextResponse.json({ error: 'Failed to load blocked slots' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const auth = await requireStaffAuth()
  if (auth.error) return auth.error

  try {
    const body = (await request.json()) as { date?: string; slotId?: string; reason?: string }
    const date = body.date?.trim()
    const slotId = body.slotId?.trim()
    const reason = (body.reason ?? '').trim() || 'Slot unavailable'

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'Valid date (YYYY-MM-DD) is required.' }, { status: 400 })
    }
    if (!slotId || !VALID_SLOT_IDS.has(slotId)) {
      return NextResponse.json({ error: 'Valid session slot id is required.' }, { status: 400 })
    }

    const saved = await upsertBlockedSlot({
      date,
      slotId,
      reason,
      createdAt: new Date().toISOString(),
      createdBy: auth.user?.email ?? undefined,
    })

    return NextResponse.json(saved)
  } catch (error) {
    console.error('POST /api/blocked-slots', error)
    const msg = error instanceof Error ? error.message : 'Failed to block slot'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const auth = await requireStaffAuth()
  if (auth.error) return auth.error

  const params = new URL(request.url).searchParams
  const date = params.get('date')?.trim()
  const slotId = params.get('slotId')?.trim()

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Valid date query param required.' }, { status: 400 })
  }
  if (!slotId || !VALID_SLOT_IDS.has(slotId)) {
    return NextResponse.json({ error: 'Valid slotId query param required.' }, { status: 400 })
  }

  try {
    const removed = await removeBlockedSlot(date, slotId)
    if (!removed) return NextResponse.json({ error: 'Slot was not blocked.' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('DELETE /api/blocked-slots', error)
    return NextResponse.json({ error: 'Failed to unblock slot' }, { status: 500 })
  }
}
