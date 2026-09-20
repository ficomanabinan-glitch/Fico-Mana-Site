'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { KeyRound, Plus, ShieldCheck, Trash2, UserCog, Users } from 'lucide-react'
import AdminPageHeader from '@/components/admin-page-header'
import { useAdminToast } from '@/components/admin-toast-provider'
import {
  adminBtnGhost,
  adminBtnPrimary,
  adminCard,
  adminInput,
  adminLabel,
  adminPage,
  adminPanel,
  adminSelect,
} from '@/lib/admin-ui'
import type { ManageableStaffRole } from '@/lib/auth/staff-user-management'
import type { WorkflowRole } from '@/lib/auth/workflow'

type StaffAccount = {
  id: string
  email: string
  displayName: string
  role: StaffAccessRole
  createdAt: string
  lastSignInAt: string | null
  confirmedAt: string | null
  isCurrent: boolean
}

type StaffAccessRole = WorkflowRole | 'unassigned'

type StaffResponse = {
  accounts: StaffAccount[]
  currentUserId: string
  currentRole: WorkflowRole
}

const roleCopy: Record<StaffAccessRole, { label: string; detail: string }> = {
  owner: { label: 'Owner', detail: 'Full account and studio control' },
  admin: { label: 'Administrator', detail: 'Studio management and user access' },
  editor: { label: 'Editor', detail: 'Selections, editing batches, and files' },
  onsite: { label: 'Staff', detail: 'Basic studio and onsite access' },
  staff: { label: 'Staff', detail: 'Basic studio and onsite access' },
  unassigned: { label: 'No access', detail: 'Authentication exists without workspace access' },
}

const roleOptions: ManageableStaffRole[] = ['admin', 'editor', 'staff']

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: 'include',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  const body = (await response.json().catch(() => ({}))) as T & { error?: string }
  if (!response.ok) throw new Error(body.error || 'The request could not be completed.')
  return body
}

export default function UserAccessPage() {
  const toast = useAdminToast()
  const [data, setData] = useState<StaffResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<StaffAccount | null>(null)
  const [deleteEmail, setDeleteEmail] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await api<StaffResponse>('/api/admin/users'))
    } catch (error) {
      toast.error('Could not load user access', error instanceof Error ? error.message : undefined)
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { void load() }, [load])

  const editors = useMemo(
    () => data?.accounts.filter((account) => account.role === 'editor').length ?? 0,
    [data],
  )

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    setBusy(true)
    try {
      await api('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          email: form.get('email'),
          displayName: form.get('displayName'),
          password: form.get('password'),
          role: form.get('role'),
        }),
      })
      formElement.reset()
      setShowCreate(false)
      toast.success('Account created', 'The staff member can sign in immediately with the temporary password.')
      await load()
    } catch (error) {
      toast.error('Account not created', error instanceof Error ? error.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  async function updateAccount(account: StaffAccount, role: ManageableStaffRole, displayName: string) {
    setBusy(true)
    try {
      await api('/api/admin/users', {
        method: 'PATCH',
        body: JSON.stringify({ userId: account.id, role, displayName }),
      })
      toast.success('Access updated', `${account.email} is now ${roleCopy[role].label.toLowerCase()}.`)
      await load()
    } catch (error) {
      toast.error('Access not updated', error instanceof Error ? error.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  async function deleteAccount() {
    if (!deleteTarget) return
    setBusy(true)
    try {
      await api('/api/admin/users', {
        method: 'DELETE',
        body: JSON.stringify({ userId: deleteTarget.id, confirmationEmail: deleteEmail }),
      })
      toast.success('Account deleted', `${deleteTarget.email} can no longer sign in.`)
      setDeleteTarget(null)
      setDeleteEmail('')
      await load()
    } catch (error) {
      toast.error('Account not deleted', error instanceof Error ? error.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const newPassword = String(form.get('newPassword') || '')
    if (newPassword !== String(form.get('confirmPassword') || '')) {
      toast.error('Passwords do not match', 'Enter the same new password twice.')
      return
    }
    setBusy(true)
    try {
      await api('/api/admin/users/password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: form.get('currentPassword'), newPassword }),
      })
      formElement.reset()
      toast.success('Password changed', 'Use the new password the next time you sign in.')
    } catch (error) {
      toast.error('Password not changed', error instanceof Error ? error.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  const canAssign = (role: StaffAccessRole) =>
    data?.currentRole === 'owner' ? role !== 'owner' : ['editor', 'onsite', 'staff', 'unassigned'].includes(role)

  return (
    <div className={adminPage}>
      <AdminPageHeader
        title="User Access"
        subtitle="Create staff accounts and control who can use the Admin and Editor workspaces."
        onRefresh={() => void load()}
        refreshing={loading}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Metric icon={Users} label="Active accounts" value={String(data?.accounts.length ?? 0)} />
        <Metric icon={UserCog} label="Editors" value={String(editors)} />
        <Metric icon={ShieldCheck} label="Your access" value={data ? roleCopy[data.currentRole].label : 'Checking…'} />
      </div>

      <section className={`${adminPanel} overflow-hidden`}>
        <div className="flex flex-col gap-3 border-b border-white/10 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Staff accounts</h2>
            <p className="mt-1 text-sm text-white/45">Roles are enforced by the server and the FICO MANA workspace membership.</p>
          </div>
          <button type="button" onClick={() => setShowCreate((value) => !value)} className={`${adminBtnPrimary} inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap px-4`}>
            <Plus className="size-4" /> Add account
          </button>
        </div>

        {showCreate ? <CreateAccountForm busy={busy} currentRole={data?.currentRole} onSubmit={createAccount} onCancel={() => setShowCreate(false)} /> : null}

        <div className="divide-y divide-white/[0.08]">
          {loading && !data ? <p className="p-6 text-sm text-white/45">Loading staff accounts…</p> : null}
          {data?.accounts.map((account) => (
            <AccountRow
              key={account.id}
              account={account}
              busy={busy}
              canManage={!account.isCurrent && canAssign(account.role)}
              roleChoices={roleOptions.filter((role) => data.currentRole === 'owner' || role !== 'admin')}
              onSave={updateAccount}
              onDelete={() => { setDeleteTarget(account); setDeleteEmail('') }}
            />
          ))}
        </div>
      </section>

      <section className={`${adminPanel} p-5 sm:p-6`}>
        <div className="flex items-start gap-3">
          <KeyRound className="mt-0.5 size-5 text-[#C4CEFF]" />
          <div>
            <h2 className="text-lg font-semibold">Change your password</h2>
            <p className="mt-1 text-sm text-white/45">Your current password is required. Other administrators cannot view it.</p>
          </div>
        </div>
        <form onSubmit={changePassword} className="mt-5 grid items-start gap-4 lg:grid-cols-3">
          <PasswordField name="currentPassword" label="Current password" />
          <PasswordField name="newPassword" label="New password" hint="12+ characters with uppercase, lowercase, number, and symbol" />
          <PasswordField name="confirmPassword" label="Confirm new password" />
          <div className="flex justify-end lg:col-span-3">
            <button disabled={busy} className={`${adminBtnPrimary} px-5`}>Change password</button>
          </div>
        </form>
      </section>

      {deleteTarget ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="delete-account-title" className={`${adminPanel} w-full max-w-md p-6`}>
            <Trash2 className="size-5 text-red-300" />
            <h2 id="delete-account-title" className="mt-4 text-xl font-semibold">Delete staff account?</h2>
            <p className="mt-2 text-sm leading-relaxed text-white/55">This immediately revokes access for <strong className="text-white">{deleteTarget.email}</strong>. Type the email address to confirm.</p>
            <label className={`${adminLabel} mt-5 block`}>Confirm email
              <input value={deleteEmail} onChange={(event) => setDeleteEmail(event.target.value)} className={`${adminInput} mt-2 normal-case`} autoFocus />
            </label>
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={() => setDeleteTarget(null)} className={`${adminBtnGhost} px-4`}>Cancel</button>
              <button type="button" disabled={busy || deleteEmail.trim().toLowerCase() !== deleteTarget.email.toLowerCase()} onClick={() => void deleteAccount()} className="min-h-11 rounded-control bg-red-500 px-4 text-sm font-semibold text-white disabled:opacity-40">Delete account</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Metric({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return <div className={`${adminCard} p-5`}><Icon className="size-5 text-[#C4CEFF]" /><p className="mt-4 text-xs font-semibold uppercase tracking-wider text-white/35">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></div>
}

function CreateAccountForm({ busy, currentRole, onSubmit, onCancel }: { busy: boolean; currentRole?: WorkflowRole; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onCancel: () => void }) {
  return <form onSubmit={onSubmit} className="grid gap-4 border-b border-white/10 bg-white/[0.02] p-5 lg:grid-cols-2">
    <label className={adminLabel}>Full name<input name="displayName" required maxLength={80} className={`${adminInput} mt-2 normal-case`} placeholder="Staff member’s name" /></label>
    <label className={adminLabel}>Email address<input name="email" type="email" required className={`${adminInput} mt-2 normal-case`} placeholder="staff@ficomana.com" /></label>
    <label className={adminLabel}>Temporary password<input name="password" type="password" required minLength={12} className={`${adminInput} mt-2 normal-case`} autoComplete="new-password" /><span className="mt-1.5 block text-[11px] font-normal normal-case tracking-normal text-white/35">12+ characters with uppercase, lowercase, number, and symbol</span></label>
    <label className={adminLabel}>Access level<select name="role" className={`${adminSelect} mt-2`} defaultValue="editor">{roleOptions.filter((role) => currentRole === 'owner' || role !== 'admin').map((role) => <option value={role} key={role}>{roleCopy[role].label} — {roleCopy[role].detail}</option>)}</select></label>
    <div className="flex justify-end gap-3 lg:col-span-2"><button type="button" onClick={onCancel} className={`${adminBtnGhost} px-4`}>Cancel</button><button disabled={busy} className={`${adminBtnPrimary} px-5`}>Create account</button></div>
  </form>
}

function AccountRow({ account, busy, canManage, roleChoices, onSave, onDelete }: { account: StaffAccount; busy: boolean; canManage: boolean; roleChoices: ManageableStaffRole[]; onSave: (account: StaffAccount, role: ManageableStaffRole, displayName: string) => Promise<void>; onDelete: () => void }) {
  const [role, setRole] = useState<ManageableStaffRole>(account.role === 'owner' || account.role === 'unassigned' ? 'editor' : account.role === 'onsite' ? 'staff' : account.role)
  const [displayName, setDisplayName] = useState(account.displayName)
  const changed = role !== (account.role === 'onsite' ? 'staff' : account.role) || displayName.trim() !== account.displayName
  return <div className="grid min-w-0 gap-4 p-5 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,.65fr)_minmax(0,1.6fr)] xl:items-center">
    <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="break-words font-semibold">{account.displayName}</p>{account.isCurrent ? <span className="rounded-full border border-[#C4CEFF]/25 bg-[#C4CEFF]/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-[#C4CEFF]">You</span> : null}</div><p className="mt-1 break-all text-sm text-white/65">{account.email}</p></div>
    <div className="min-w-0"><p className="text-sm font-semibold">{roleCopy[account.role].label}</p><p className="mt-1 text-xs text-white/65">{account.lastSignInAt ? `Last sign-in ${new Date(account.lastSignInAt).toLocaleDateString('en-PH')}` : 'Has not signed in yet'}</p></div>
    {canManage ? <div className="grid min-w-0 items-end gap-3 sm:col-span-2 sm:grid-cols-2 xl:col-span-1 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
      <label className={`${adminLabel} min-w-0`}>Display name<input value={displayName} disabled={busy} maxLength={80} onChange={(event) => setDisplayName(event.target.value)} className={`${adminInput} mt-2 font-normal normal-case tracking-normal`} aria-label={`Display name for ${account.email}`} /></label>
      <label className={`${adminLabel} min-w-0`}>Access level<select value={role} disabled={busy} onChange={(event) => setRole(event.target.value as ManageableStaffRole)} className={`${adminSelect} mt-2 normal-case tracking-normal`} aria-label={`Access level for ${account.email}`}>{roleChoices.map((choice) => <option value={choice} key={choice}>{roleCopy[choice].label}</option>)}</select></label>
      <div className="flex justify-end gap-2 sm:col-span-2 2xl:col-span-1"><button type="button" disabled={busy || !changed || !displayName.trim()} onClick={() => void onSave(account, role, displayName.trim())} className={`${adminBtnGhost} px-4`} aria-label={`Save access for ${account.email}`}>Save</button><button type="button" disabled={busy} onClick={onDelete} className="inline-flex size-11 shrink-0 items-center justify-center rounded-control border border-red-400/20 text-red-300 hover:bg-red-400/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 disabled:opacity-50" aria-label={`Delete ${account.email}`}><Trash2 className="size-4" /></button></div>
    </div> : <p className="text-sm text-white/65 sm:col-span-2 xl:col-span-1">{account.role === 'owner' ? 'Owner accounts are protected.' : 'Manage your own password below.'}</p>}
  </div>
}

function PasswordField({ name, label, hint }: { name: string; label: string; hint?: string }) {
  return <label className={`${adminLabel} block min-w-0`}>{label}<input name={name} type="password" required minLength={name === 'currentPassword' ? 1 : 12} className={`${adminInput} mt-2 font-normal normal-case tracking-normal`} aria-describedby={hint ? `${name}-hint` : undefined} autoComplete={name === 'currentPassword' ? 'current-password' : 'new-password'} />{hint ? <span id={`${name}-hint`} className="mt-2 block text-xs font-normal normal-case tracking-normal text-white/65">{hint}</span> : null}</label>
}
