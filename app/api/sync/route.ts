import { NextResponse } from 'next/server'
import { requireStaffAuth } from '@/lib/auth-api'
import { syncStoreToDatabase } from '@/lib/db-sync'

export async function POST(request: Request) {
  try {
    const { error: authError } = await requireStaffAuth(request)
    if (authError) return authError

    const result = await syncStoreToDatabase()
    return NextResponse.json(result)
  } catch (error) {
    console.error('POST /api/sync', error)
    return NextResponse.json({ ok: false, error: 'Sync failed' }, { status: 500 })
  }
}
