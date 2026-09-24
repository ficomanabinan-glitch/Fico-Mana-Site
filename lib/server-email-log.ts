import type { EmailLog } from '@/lib/data-store'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { isSupabaseConfigured } from '@/lib/supabase/env'
import { promises as fs } from 'fs'
import path from 'path'
import { assertLocalFileStoreAllowed } from '@/lib/security/local-file-store'

const LOG_PATH = path.join(process.cwd(), 'data', 'email-logs.json')

async function readFileLogs(): Promise<EmailLog[]> {
  assertLocalFileStoreAllowed()
  try {
    const raw = await fs.readFile(LOG_PATH, 'utf-8')
    return JSON.parse(raw) as EmailLog[]
  } catch {
    return []
  }
}

async function writeFileLogs(logs: EmailLog[]): Promise<void> {
  assertLocalFileStoreAllowed()
  await fs.mkdir(path.dirname(LOG_PATH), { recursive: true })
  await fs.writeFile(LOG_PATH, JSON.stringify(logs.slice(0, 500), null, 2), 'utf-8')
}

export async function persistEmailLog(
  log: Omit<EmailLog, 'id' | 'sentAt'> & { providerId?: string | null },
): Promise<EmailLog> {
  const { providerId = null, ...publicLog } = log
  const entry: EmailLog = {
    ...publicLog,
    id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    sentAt: new Date().toISOString(),
  }

  if (isSupabaseConfigured()) {
    const admin = getSupabaseAdmin()
    if (admin) {
      const payload = {
          booking_id: log.bookingId,
          recipient_email: log.recipientEmail,
          subject: log.subject,
          body: log.body,
          status: log.status,
          provider_id: providerId,
      }
      const query = providerId
        ? admin.from('email_logs').upsert(payload, { onConflict: 'provider_id', ignoreDuplicates: true })
        : admin.from('email_logs').insert(payload)
      const { data, error } = await query
        .select()
        .maybeSingle()

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
      if (!error && providerId) {
        const existing = await admin.from('email_logs').select('*').eq('provider_id', providerId).maybeSingle()
        if (!existing.error && existing.data) {
          return {
            id: String(existing.data.id),
            bookingId: String(existing.data.booking_id),
            recipientEmail: String(existing.data.recipient_email),
            subject: String(existing.data.subject),
            body: String(existing.data.body),
            status: existing.data.status as EmailLog['status'],
            sentAt: String(existing.data.sent_at),
          }
        }
      }
      console.error('Email log persistence failed; no local copy was created.')
    }
    // Delivery has already been attempted. Never turn a logging failure into a
    // duplicate send, and never mirror recipient details or bearer links to disk.
    return entry
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
    throw new Error('Email history is temporarily unavailable.')
  }

  return readFileLogs()
}
