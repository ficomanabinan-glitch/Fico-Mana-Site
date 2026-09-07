'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { Cloud, Database, ExternalLink, Mail, PackageOpen, ShieldCheck } from 'lucide-react'
import AdminPageHeader from '@/components/admin-page-header'
import ShootReminderSettings from '@/components/shoot-reminder-settings'
import EmailTestSettings from '@/components/email-test-settings'
import { adminBtnGhost, adminPage, adminPanel } from '@/lib/admin-ui'

type DriveHealth = {
  connected: boolean
  oauthAppConfigured: boolean
  accountEmail: string | null
  rootFolderName: string | null
}

type EmailHealth = {
  ok: boolean
  fromAddress?: string | null
  error?: string
}

export default function SystemPage() {
  const [drive, setDrive] = useState<DriveHealth | null>(null)
  const [email, setEmail] = useState<EmailHealth | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [driveResult, emailResult] = await Promise.allSettled([
      fetch('/api/integrations/google-drive', { cache: 'no-store', credentials: 'include' }).then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as DriveHealth & { error?: string }
        if (!response.ok) throw new Error(body.error || 'Drive health check failed.')
        return body
      }),
      fetch('/api/emails/health', { cache: 'no-store', credentials: 'include' }).then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as EmailHealth
        if (!response.ok) throw new Error(body.error || 'Email health check failed.')
        return body
      }),
    ])
    setDrive(driveResult.status === 'fulfilled' ? driveResult.value : null)
    setEmail(emailResult.status === 'fulfilled' ? emailResult.value : null)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className={adminPage}>
      <AdminPageHeader
        title="System"
        subtitle="Production health and settings for storage, notifications, and automated shoot reminders."
        onRefresh={() => void load()}
        refreshing={loading}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatusCard
          icon={Database}
          title="Database"
          value="Connected"
          tone="good"
          detail="Bookings, payments, editor jobs, selections, deliveries, and audit records are stored in Supabase."
        />
        <StatusCard
          icon={ShieldCheck}
          title="Security"
          value="Server enforced"
          tone="good"
          detail="Admin access is authenticated server-side and workflow tables are protected from direct browser writes."
        />
        <StatusCard
          icon={Cloud}
          title="Google Drive"
          value={loading ? 'Checking…' : drive?.connected ? 'Connected' : 'Action needed'}
          tone={drive?.connected ? 'good' : 'warning'}
          detail={
            drive?.connected
              ? `${drive.accountEmail || 'Drive account'} · ${drive.rootFolderName || 'FICOMANA SHOOTS'}`
              : drive?.oauthAppConfigured
                ? 'Connect the production Google account before uploading or delivering photos.'
                : 'Google OAuth credentials must be configured before the Drive account can be connected.'
          }
        />
        <StatusCard
          icon={Mail}
          title="Email"
          value={loading ? 'Checking…' : email?.ok ? 'Configured' : 'Action needed'}
          tone={email?.ok ? 'good' : 'warning'}
          detail={email?.ok ? `API key is present${email.fromAddress ? ` for ${email.fromAddress}` : ''}. Use the test below to verify delivery.` : 'Configure Resend on the production deployment to send delivery notifications.'}
        />
      </div>

      <EmailTestSettings configured={!loading && !!email?.ok} fromAddress={email?.fromAddress} />

      <ShootReminderSettings />

      <section className={`${adminPanel} flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between`}>
        <div>
          <p className="text-[9px] font-bold uppercase tracking-wider text-white/35">Production storage</p>
          <h2 className="mt-1 text-sm font-semibold">Google Drive folder and portal settings</h2>
          <p className="mt-1 text-xs text-white/40">Connect the account, choose the root folder, and manage live client portals.</p>
        </div>
        <Link href="/admin/provisioning" className={`${adminBtnGhost} inline-flex shrink-0 items-center gap-2 px-4 py-3`}>
          Manage Google Drive <ExternalLink className="size-3.5" />
        </Link>
      </section>

      <section className={`${adminPanel} flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between`}>
        <div className="flex items-start gap-3">
          <PackageOpen className="mt-0.5 size-5 shrink-0 text-[#C4CEFF]" />
          <div>
            <p className="text-[9px] font-bold uppercase tracking-wider text-white/35">Website catalog</p>
            <h2 className="mt-1 text-sm font-semibold">Packages and client photo-selection rules</h2>
            <p className="mt-1 text-xs text-white/40">Update prices, inclusions, visibility, and the number of photos clients select for each package.</p>
          </div>
        </div>
        <Link href="/admin/packages" className={`${adminBtnGhost} inline-flex shrink-0 items-center gap-2 px-4 py-3`}>
          Manage Packages <ExternalLink className="size-3.5" />
        </Link>
      </section>
    </div>
  )
}

function StatusCard({
  icon: Icon,
  title,
  value,
  detail,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  value: string
  detail: string
  tone: 'good' | 'warning'
}) {
  return (
    <div className="border border-white/10 bg-white/[0.02] p-5">
      <Icon className={tone === 'good' ? 'size-5 text-emerald-300' : 'size-5 text-amber-300'} />
      <p className="mt-4 text-[9px] font-bold uppercase tracking-wider text-white/35">{title}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
      <p className="mt-2 text-[11px] leading-relaxed text-white/40">{detail}</p>
    </div>
  )
}
