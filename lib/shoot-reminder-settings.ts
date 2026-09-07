import { z } from 'zod'
import type { ShootReminderIssue } from './shoot-reminder-issues'

export const shootReminderSettingsAction = z.object({
  action: z.enum(['check', 'enable', 'pause']),
}).strict()

export type ShootReminderControl = {
  enabled: boolean
  configured: boolean
  schedulerActive: boolean
  probeStatus: 'not_checked' | 'checking' | 'ready' | 'failed'
  checkedAt: string | null
  lastVerifiedAt: string | null
  canActivate: boolean
  problem: string | null
  lastCompletedAt: string | null
  updatedAt: string | null
  timeZone: 'Asia/Manila'
  sendTime: '06:00'
  firstReminderDaysBefore: 1
  morningRule: 'confirmed_or_no_response_after_first_email'
  emailConfigured: boolean
  senderAddress: string | null
  runtimeIssue?: ShootReminderIssue | null
  failedToday?: number | null
}

export function canManageShootReminders(access: { workspaceSlug: string; role: string } | null) {
  return access?.workspaceSlug === 'fico-mana' && ['owner', 'admin'].includes(access.role)
}
