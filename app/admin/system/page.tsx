'use client'
import { useCachedPageRead } from '@/components/use-cached-page-read'

import Link from 'next/link'
import { useCallback, useEffect } from 'react'
import { Cloud, Database, ExternalLink, Mail, ShieldCheck } from 'lucide-react'
import AdminPageHeader from '@/components/admin-page-header'
import ShootReminderSettings from '@/components/shoot-reminder-settings'
import EmailTestSettings from '@/components/email-test-settings'
import ShootStorageCleanup from '@/components/shoot-storage-cleanup'
import { adminBtnGhost, adminCard, adminPage, adminPanel } from '@/lib/admin-ui'

type StorageHealth = {
  configured: boolean
  provider: string
  privateBucket: boolean
}

type EmailHealth = {
  ok: boolean
  fromAddress?: string | null
  error?: string
}

export default function SystemPage() {
  const [health, setHealth, loading, setLoading, refreshing] = useCachedPageRead<{
    storage: StorageHealth | null; email: EmailHealth | null
  } | null>('admin:system-health', null)
  const storage = health?.storage
  const email = health?.email

  const load = useCallback(async () => {
    setLoading(true)
    const [storageResult, emailResult] = await Promise.allSettled([
      fetch('/api/storage/settings', { cache: 'no-store', credentials: 'include' }).then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as StorageHealth & { error?: string }
        if (!response.ok) throw new Error(body.error || 'Storage health check failed.')
        return body
      }),
      fetch('/api/emails/health', { cache: 'no-store', credentials: 'include' }).then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as EmailHealth
        if (!response.ok) throw new Error(body.error || 'Email health check failed.')
        return body
      }),
    ])
    setHealth({
      storage: storageResult.status === 'fulfilled' ? storageResult.value : null,
      email: emailResult.status === 'fulfilled' ? emailResult.value : null,
    })
    setLoading(false)
  }, [setHealth, setLoading])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className={adminPage}>
      <AdminPageHeader
        title="System"
        subtitle="Manage private storage, email, and reminder settings."
        onRefresh={() => void load()}
        refreshing={refreshing}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatusCard
          icon={Database}
          title="Records"
          value="Studio records"
          tone="neutral"
          detail="Bookings, payments, photos, and activity history are managed in the studio workspaces. Open Bookings to review current records."
        />
        <StatusCard
          icon={ShieldCheck}
          title="Security"
          value="Staff access controls"
          tone="neutral"
          detail="Only authorized staff can view and update your records. Review accounts and roles in User Access. This is not an independent security health check."
        />
        <StatusCard
          icon={Cloud}
          title="Private storage"
          value={loading ? 'Checking…' : !storage ? 'Check unavailable' : storage.configured && storage.privateBucket ? 'Configured' : 'Action needed'}
          tone={loading || !storage ? 'neutral' : storage.configured && storage.privateBucket ? 'good' : 'warning'}
          detail={
            loading ? 'Checking the current storage configuration.' : !storage ? 'Storage could not be checked. Refresh this page to try again; no readiness has been confirmed.' : storage.configured
              ? `${storage.provider} · ${storage.privateBucket ? 'Private bucket' : 'Review bucket privacy'}`
              : 'Cloudflare R2 credentials are incomplete. Ask your administrator to finish the server configuration.'
          }
        />
        <StatusCard
          icon={Mail}
          title="Email"
          value={loading ? 'Checking…' : !email ? 'Check unavailable' : email.ok ? 'Configured' : 'Action needed'}
          tone={loading || !email ? 'neutral' : email.ok ? 'good' : 'warning'}
          detail={loading ? 'Checking the current email configuration.' : !email ? 'Email could not be checked. Refresh this page to try again; delivery has not been confirmed.' : email.ok ? `Email setup is available${email.fromAddress ? ` for ${email.fromAddress}` : ''}. Use the test below to check delivery.` : 'Complete email setup to send client notifications.'}
        />
      </div>

      <EmailTestSettings configured={!loading && !!email?.ok} fromAddress={email?.fromAddress} />

      <ShootReminderSettings />

      <section className={`${adminPanel} flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between`}>
        <div>
          <p className="text-caption font-semibold uppercase tracking-wider text-white/35">Production storage</p>
          <h2 className="mt-1 text-sm font-semibold">Private storage and portal settings</h2>
          <p className="mt-1 text-xs text-white/40">Review storage readiness, retention controls, and live client portals.</p>
        </div>
        <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <ShootStorageCleanup />
          <a href="https://editor.ficomana.com/editor/files" className={`${adminBtnGhost} inline-flex shrink-0 items-center gap-2 px-4 py-3`}>
            Manage Storage <ExternalLink className="size-3.5" />
          </a>
        </div>
      </section>

      <section className={`${adminPanel} flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between`}>
        <div className="flex items-start gap-3">
          <div>
            <p className="text-caption font-semibold uppercase tracking-wider text-white/35">Website catalog</p>
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
  tone: 'good' | 'warning' | 'neutral'
}) {
  return (
    <div className={`${adminCard} p-5`}>
      <Icon className={tone === 'good' ? 'size-5 text-emerald-300' : tone === 'warning' ? 'size-5 text-amber-300' : 'size-5 text-white/65'} />
      <p className="mt-4 text-caption font-semibold uppercase tracking-wider text-white/35">{title}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
      <p className="mt-2 text-caption leading-relaxed text-white/40">{detail}</p>
    </div>
  )
}
