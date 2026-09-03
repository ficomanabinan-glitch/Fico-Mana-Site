import { NextResponse } from 'next/server'
import { requireStaffAuth } from '@/lib/auth-api'
import { listServerEmailLogs } from '@/lib/server-email-log'

export async function GET() {
  try {
    const { error: authError } = await requireStaffAuth()
    if (authError) return authError

    const logs = await listServerEmailLogs()
    return NextResponse.json(logs)
  } catch (error) {
    console.error('GET /api/emails/logs', error)
    return NextResponse.json({ error: 'Failed to load email logs' }, { status: 500 })
  }
}
