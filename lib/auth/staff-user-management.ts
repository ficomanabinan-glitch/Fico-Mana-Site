import { z } from 'zod'
import type { WorkflowRole } from '@/lib/auth/workflow'

export const MANAGEABLE_STAFF_ROLES = ['admin', 'editor', 'staff'] as const
export type ManageableStaffRole = (typeof MANAGEABLE_STAFF_ROLES)[number]

const passwordSchema = z
  .string()
  .min(12, 'Use at least 12 characters.')
  .max(128, 'Password is too long.')
  .regex(/[a-z]/, 'Add a lowercase letter.')
  .regex(/[A-Z]/, 'Add an uppercase letter.')
  .regex(/[0-9]/, 'Add a number.')
  .regex(/[^A-Za-z0-9]/, 'Add a symbol.')

export const createStaffAccountSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address.')),
  displayName: z.string().trim().min(2, 'Enter the staff member’s name.').max(80),
  password: passwordSchema,
  role: z.enum(MANAGEABLE_STAFF_ROLES),
})

export const updateStaffAccountSchema = z.object({
  userId: z.uuid(),
  displayName: z.string().trim().min(2, 'Enter the staff member’s name.').max(80),
  role: z.enum(MANAGEABLE_STAFF_ROLES),
})

export const deleteStaffAccountSchema = z.object({
  userId: z.uuid(),
  confirmationEmail: z.string().trim().toLowerCase().pipe(z.email()),
})

export const changeOwnPasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password.').max(1024),
    newPassword: passwordSchema,
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    message: 'Choose a password you have not already used.',
    path: ['newPassword'],
  })

export function canManageStaffRole(actorRole: WorkflowRole, targetRole: WorkflowRole) {
  if (targetRole === 'owner') return false
  if (actorRole === 'owner') return true
  return actorRole === 'admin' && ['editor', 'onsite', 'staff'].includes(targetRole)
}

export function staffAppMetadata(
  existing: Record<string, unknown> | null | undefined,
  role: ManageableStaffRole,
) {
  return {
    ...(existing ?? {}),
    role,
    roles: [role],
  }
}
