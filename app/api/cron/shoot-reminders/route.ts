import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { privateNoStoreHeaders } from '@/lib/security/request-security'
import { runShootReminderWorker } from '@/lib/shoot-reminder-worker'
import { getResendClient } from '@/lib/resend-config'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(request: Request) {
  const headers = privateNoStoreHeaders()
  const bearer = request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1]
  if (!bearer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers })
  const admin = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: 'Reminder service unavailable' }, { status: 503, headers })
  const { data: authorized, error } = await admin.rpc('authorize_shoot_reminder_worker', {
    p_secret_hash: createHash('sha256').update(bearer).digest('hex'),
  })
  if (error || !authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers })
  try {
    // Readiness probe does not claim jobs or send emails (provider delivery is not tested).
    if (new URL(request.url).searchParams.get('dryRun') === '1') {
      if (!getResendClient()) throw new Error('Email service not configured')
      const { data: settings, error: readError } = await admin.from('shoot_reminder_settings')
        .select('enabled,last_started_at,last_completed_at,last_result').eq('id',1).single()
      if (readError) throw new Error('Reminder setup unavailable')
      return NextResponse.json({ success: true, dryRun: true, settings }, { headers })
    }
    return NextResponse.json({ success: true, ...await runShootReminderWorker(admin) }, { headers })
  } catch (failure) {
    console.error('Scheduled shoot reminder run failed:', failure instanceof Error ? failure.message : 'Unknown error')
    return NextResponse.json({ error: 'Reminders could not finish. Try: check Shoot Reminders in Admin; pending emails will retry automatically.' }, { status: 503, headers })
  }
}
