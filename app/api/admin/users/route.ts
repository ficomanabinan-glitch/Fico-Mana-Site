import { NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { requireWorkflowAuth } from '@/lib/auth-api'
import {
  canManageStaffRole,
  createStaffAccountSchema,
  deleteStaffAccountSchema,
  staffAppMetadata,
  updateStaffAccountSchema,
} from '@/lib/auth/staff-user-management'
import type { WorkflowRole } from '@/lib/auth/workflow'
import { secureErrorResponse } from '@/lib/security/error-response'
import { privateNoStoreHeaders } from '@/lib/security/request-security'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: privateNoStoreHeaders() })

type Membership = {
  user_id: string
  role: WorkflowRole
  display_name: string | null
  created_at: string
}

async function listAuthUsers(admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>) {
  const users: User[] = []
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    users.push(...data.users)
    if (data.users.length < 1000) return users
  }
}

async function membershipFor(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  workspaceId: string,
  userId: string,
) {
  const { data, error } = await admin
    .from('workspace_members')
    .select('user_id,role,display_name,created_at')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return data as Membership | null
}

async function audit(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  workspaceId: string,
  actorId: string,
  action: string,
  metadata: Record<string, unknown>,
) {
  const { error } = await admin.from('workflow_audit_logs').insert({
    workspace_id: workspaceId,
    actor_type: 'staff',
    actor_id: actorId,
    action,
    metadata,
  })
  if (error) console.error('Staff account audit write failed:', error.code)
}

export async function GET(request: Request) {
  const { user, access, error } = await requireWorkflowAuth('admin', request)
  if (error) return error
  const admin = getSupabaseAdmin()
  if (!admin || !user || !access) return json({ error: 'User access is temporarily unavailable.' }, 503)

  try {
    const [{ data: memberships, error: membershipError }, users] = await Promise.all([
      admin
        .from('workspace_members')
        .select('user_id,role,display_name,created_at')
        .eq('workspace_id', access.workspaceId)
        .order('created_at', { ascending: true }),
      listAuthUsers(admin),
    ])
    if (membershipError) throw membershipError
    const byUserId = new Map(((memberships ?? []) as Membership[]).map((entry) => [entry.user_id, entry]))
    const accounts = users.map((account) => {
      const membership = byUserId.get(account.id)
      return {
        id: account.id,
        email: account.email ?? '',
        displayName: membership?.display_name || account.email?.split('@')[0] || 'Staff',
        role: membership?.role ?? 'unassigned',
        createdAt: account.created_at,
        lastSignInAt: account.last_sign_in_at ?? null,
        confirmedAt: account.confirmed_at ?? null,
        isCurrent: account.id === user.id,
      }
    })
    return json({ accounts, currentUserId: user.id, currentRole: access.role })
  } catch (caught) {
    return secureErrorResponse(caught, 'Could not load staff accounts.', { request, context: 'GET /api/admin/users' })
  }
}

export async function POST(request: Request) {
  const { user, access, error } = await requireWorkflowAuth('admin', request)
  if (error) return error
  const admin = getSupabaseAdmin()
  if (!admin || !user || !access) return json({ error: 'User access is temporarily unavailable.' }, 503)

  try {
    const parsed = createStaffAccountSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return json({ error: parsed.error.issues[0]?.message || 'Check the account details.' }, 400)
    if (!canManageStaffRole(access.role, parsed.data.role)) {
      return json({ error: 'Your role cannot create this type of account.' }, 403)
    }

    const created = await admin.auth.admin.createUser({
      email: parsed.data.email,
      password: parsed.data.password,
      email_confirm: true,
      app_metadata: staffAppMetadata({}, parsed.data.role),
    })
    if (created.error || !created.data.user) {
      const duplicate = created.error?.message.toLowerCase().includes('already')
      return json({ error: duplicate ? 'An account already uses that email address.' : 'Could not create the account.' }, duplicate ? 409 : 500)
    }

    const { error: membershipError } = await admin.from('workspace_members').insert({
      workspace_id: access.workspaceId,
      user_id: created.data.user.id,
      role: parsed.data.role,
      display_name: parsed.data.displayName,
    })
    if (membershipError) {
      await admin.auth.admin.deleteUser(created.data.user.id)
      throw membershipError
    }

    await audit(admin, access.workspaceId, user.id, 'STAFF_ACCOUNT_CREATED', {
      targetUserId: created.data.user.id,
      targetEmail: parsed.data.email,
      role: parsed.data.role,
    })
    return json({ id: created.data.user.id }, 201)
  } catch (caught) {
    return secureErrorResponse(caught, 'Could not create the account.', { request, context: 'POST /api/admin/users' })
  }
}

export async function PATCH(request: Request) {
  const { user, access, error } = await requireWorkflowAuth('admin', request)
  if (error) return error
  const admin = getSupabaseAdmin()
  if (!admin || !user || !access) return json({ error: 'User access is temporarily unavailable.' }, 503)

  try {
    const parsed = updateStaffAccountSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return json({ error: parsed.error.issues[0]?.message || 'Check the account details.' }, 400)
    if (parsed.data.userId === user.id) return json({ error: 'You cannot change your own role.' }, 409)
    if (!canManageStaffRole(access.role, parsed.data.role)) return json({ error: 'Your role cannot assign that access level.' }, 403)

    const current = await membershipFor(admin, access.workspaceId, parsed.data.userId)
    if (current && !canManageStaffRole(access.role, current.role)) return json({ error: 'You cannot modify that account.' }, 403)

    const existing = await admin.auth.admin.getUserById(parsed.data.userId)
    if (existing.error || !existing.data.user) return json({ error: 'Authentication account not found.' }, 404)

    const { error: membershipError } = await admin
      .from('workspace_members')
      .upsert({
        workspace_id: access.workspaceId,
        user_id: parsed.data.userId,
        role: parsed.data.role,
        display_name: parsed.data.displayName,
      }, { onConflict: 'workspace_id,user_id' })
    if (membershipError) throw membershipError

    const updated = await admin.auth.admin.updateUserById(parsed.data.userId, {
      app_metadata: staffAppMetadata(existing.data.user.app_metadata, parsed.data.role),
    })
    if (updated.error) {
      if (current) {
        await admin
          .from('workspace_members')
          .update({ role: current.role, display_name: current.display_name })
          .eq('workspace_id', access.workspaceId)
          .eq('user_id', parsed.data.userId)
      } else {
        await admin
          .from('workspace_members')
          .delete()
          .eq('workspace_id', access.workspaceId)
          .eq('user_id', parsed.data.userId)
      }
      throw updated.error
    }

    await audit(admin, access.workspaceId, user.id, 'STAFF_ACCESS_UPDATED', {
      targetUserId: parsed.data.userId,
      previousRole: current?.role ?? 'unassigned',
      role: parsed.data.role,
    })
    return json({ ok: true })
  } catch (caught) {
    return secureErrorResponse(caught, 'Could not update staff access.', { request, context: 'PATCH /api/admin/users' })
  }
}

export async function DELETE(request: Request) {
  const { user, access, error } = await requireWorkflowAuth('admin', request)
  if (error) return error
  const admin = getSupabaseAdmin()
  if (!admin || !user || !access) return json({ error: 'User access is temporarily unavailable.' }, 503)

  try {
    const parsed = deleteStaffAccountSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return json({ error: 'Enter the account email to confirm deletion.' }, 400)
    if (parsed.data.userId === user.id) return json({ error: 'You cannot delete your own account.' }, 409)

    const current = await membershipFor(admin, access.workspaceId, parsed.data.userId)
    if (current && !canManageStaffRole(access.role, current.role)) return json({ error: 'You cannot delete that account.' }, 403)
    if (!current && access.role !== 'owner') return json({ error: 'Only an owner can delete an unassigned authentication account.' }, 403)

    const existing = await admin.auth.admin.getUserById(parsed.data.userId)
    const email = existing.data.user?.email?.trim().toLowerCase()
    if (existing.error || !email) return json({ error: 'Authentication account not found.' }, 404)
    if (email !== parsed.data.confirmationEmail) return json({ error: 'The confirmation email does not match.' }, 400)

    const deleted = await admin.auth.admin.deleteUser(parsed.data.userId)
    if (deleted.error) throw deleted.error
    await audit(admin, access.workspaceId, user.id, 'STAFF_ACCOUNT_DELETED', {
      targetUserId: parsed.data.userId,
      targetEmail: email,
      previousRole: current?.role ?? 'unassigned',
    })
    return json({ ok: true })
  } catch (caught) {
    return secureErrorResponse(caught, 'Could not delete the account.', { request, context: 'DELETE /api/admin/users' })
  }
}
