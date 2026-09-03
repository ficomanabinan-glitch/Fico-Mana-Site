import type { EmailLog } from '@/lib/data-store'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { isSupabaseConfigured } from '@/lib/supabase/env'
import { promises as fs } from 'fs'
import path from 'path'

const LOG_PATH = path.join(process.cwd(), 'data', 'email-logs.json')

async function readFileLogs(): Promise<EmailLog[]> {
  try {
    const raw = await fs.readFile(LOG_PATH, 'utf-8')
    return JSON.parse(raw) as EmailLog[]
  } catch {
    return []
  }
}

async function writeFileLogs(logs: EmailLog[]): Promise<void> {
  await fs.mkdir(path.dirname(LOG_PATH), { recursive: true })
  await fs.writeFile(LOG_PATH, JSON.stringify(logs.slice(0, 500), null, 2), 'utf-8')
}

export async function persistEmailLog(
  log: Omit<EmailLog, 'id' | 'sentAt'>,
): Promise<EmailLog> {
  const entry: EmailLog = {
    ...log,
    id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    sentAt: new Date().toISOString(),
  }

  if (isSupabaseConfigured()) {
    const admin = getSupabaseAdmin()
    if (admin) {
      const { data, error } = await admin
        .from('email_logs')
        .insert({
          booking_id: log.bookingId,
          recipient_email: log.recipientEmail,
          subject: log.subject,
          body: log.body,
          status: log.status,
        })
        .select()
        .single()

      if (!error && data) {
        return {
          id: String(data.id),
          bookingId: String(data.booking_id),
          recipientEmail: String(data.recipient_email),
          subject: String(data.subject),
          body: String(data.body),
          status: data.status as EmailLog['status'],
          sentAt: String(data.sent_at),
        }
      }
      console.error('persistEmailLog supabase:', error?.message)
    }
  }

  const logs = await readFileLogs()
  logs.unshift(entry)
  await writeFileLogs(logs)
  return entry
}

export async function listServerEmailLogs(): Promise<EmailLog[]> {
  if (isSupabaseConfigured()) {
    const admin = getSupabaseAdmin()
    if (admin) {
      const { data, error } = await admin
        .from('email_logs')
        .select('*')
        .order('sent_at', { ascending: false })
        .limit(200)

      if (!error && data) {
        return data.map((l) => ({
          id: String(l.id),
          bookingId: String(l.booking_id),
          recipientEmail: String(l.recipient_email),
          subject: String(l.subject),
          body: String(l.body),
          status: l.status as EmailLog['status'],
          sentAt: String(l.sent_at),
        }))
      }
    }
  }

  return readFileLogs()
}
