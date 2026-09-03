import { NextResponse } from 'next/server'
import { FICO_DAILY_LIMIT } from '@/lib/booking-slots'
import { requireStaffAuth } from '@/lib/auth-api'
import {
  listFicoSpotBlocks,
  removeFicoSpotBlock,
  upsertFicoSpotBlock,
} from '@/lib/server-fico-spot-blocks'

/** Public: FICO spots held per day. Staff: POST/DELETE to manage. */
export async function GET() {
  try {
    const blocks = await listFicoSpotBlocks()
    return NextResponse.json(blocks)
  } catch (error) {
    console.error('GET /api/fico-spot-blocks', error)
    return NextResponse.json({ error: 'Failed to load FICO spot blocks' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const auth = await requireStaffAuth()
  if (auth.error) return auth.error

  try {
    const body = (await request.json()) as { date?: string; spotsBlocked?: number; reason?: string }
    const date = body.date?.trim()
    const spotsBlocked = Number(body.spotsBlocked ?? 0)
    const reason = (body.reason ?? '').trim() || 'Spots held by studio'

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'Valid date (YYYY-MM-DD) is required.' }, { status: 400 })
    }
    if (!Number.isFinite(spotsBlocked) || spotsBlocked < 0 || spotsBlocked > FICO_DAILY_LIMIT) {
      return NextResponse.json(
        { error: `spotsBlocked must be between 0 and ${FICO_DAILY_LIMIT}.` },
        { status: 400 },
      )
    }

    if (spotsBlocked === 0) {
      await removeFicoSpotBlock(date)
      return NextResponse.json({ ok: true, cleared: true })
    }

    const saved = await upsertFicoSpotBlock({
      date,
      spotsBlocked,
      reason,
      createdAt: new Date().toISOString(),
      createdBy: auth.user?.email ?? undefined,
    })

    return NextResponse.json(saved)
  } catch (error) {
    console.error('POST /api/fico-spot-blocks', error)
    const msg = error instanceof Error ? error.message : 'Failed to update FICO spots'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const auth = await requireStaffAuth()
  if (auth.error) return auth.error

  const date = new URL(request.url).searchParams.get('date')?.trim()
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Valid date query param required.' }, { status: 400 })
  }

  try {
    const removed = await removeFicoSpotBlock(date)
    if (!removed) return NextResponse.json({ error: 'No FICO spot hold on this date.' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('DELETE /api/fico-spot-blocks', error)
    return NextResponse.json({ error: 'Failed to clear FICO spot hold' }, { status: 500 })
  }
}
