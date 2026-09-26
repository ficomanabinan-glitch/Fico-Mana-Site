'use client'

import { useCallback, useEffect, useState } from 'react'
import { ExternalLink, MapPinned, Save, Smartphone, Share2 } from 'lucide-react'
import AdminPageHeader from '@/components/admin-page-header'
import { useAdminToast } from '@/components/admin-toast-provider'
import { adminBtnPrimary, adminInput, adminLabel, adminPage, adminPanel } from '@/lib/admin-ui'
import { DEFAULT_WEBSITE_CONTENT, type WebsiteContent } from '@/lib/website-content'

export default function ContentManagementPage() {
  const toast = useAdminToast()
  const [content, setContent] = useState<WebsiteContent>(DEFAULT_WEBSITE_CONTENT)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/admin/website-content', { cache: 'no-store', credentials: 'include' })
      const body = await response.json().catch(() => ({})) as WebsiteContent & { error?: string }
      if (!response.ok) throw new Error(body.error || 'Could not load website content.')
      setContent(body)
    } catch (error) {
      toast.error('Content unavailable', error instanceof Error ? error.message : 'Refresh and try again.')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { void load() }, [load])

  const field = (key: keyof WebsiteContent, value: string) => setContent((current) => ({ ...current, [key]: value }))
  const save = async () => {
    setSaving(true)
    try {
      const response = await fetch('/api/admin/website-content', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(content),
      })
      const body = await response.json().catch(() => ({})) as WebsiteContent & { error?: string }
      if (!response.ok) throw new Error(body.error || 'Could not save website content.')
      setContent(body)
      toast.success('Website content updated', 'The public contact and location details are now current.')
    } catch (error) {
      toast.error('Save failed', error instanceof Error ? error.message : 'Check the details and try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={adminPage}>
      <AdminPageHeader
        title="Content Management"
        subtitle="Update the public studio contact, location, map, and social links without editing code."
        onRefresh={() => void load()}
        refreshing={loading}
      />

      <div className="grid gap-6 xl:grid-cols-12">
        <div className="space-y-6 xl:col-span-7">
          <ContentSection icon={Smartphone} eyebrow="Contact" title="Studio identity and contact">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Studio name"><input className={adminInput} value={content.studioName} onChange={(event) => field('studioName', event.target.value)} /></Field>
              <Field label="Mobile / telephone"><input className={adminInput} value={content.phoneNumber} onChange={(event) => field('phoneNumber', event.target.value)} placeholder="+63 9XX XXX XXXX" /></Field>
              <Field label="Public email (optional)"><input type="email" className={adminInput} value={content.publicEmail} onChange={(event) => field('publicEmail', event.target.value)} /></Field>
              <Field label="Business hours (optional)"><input className={adminInput} value={content.businessHours} onChange={(event) => field('businessHours', event.target.value)} placeholder="Daily, 8:00 AM – 6:00 PM" /></Field>
            </div>
          </ContentSection>

          <ContentSection icon={MapPinned} eyebrow="Location" title="Address and Google Maps">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Address line 1"><input className={adminInput} value={content.addressLine1} onChange={(event) => field('addressLine1', event.target.value)} /></Field>
              <Field label="Address line 2"><input className={adminInput} value={content.addressLine2} onChange={(event) => field('addressLine2', event.target.value)} /></Field>
              <div className="sm:col-span-2"><Field label="Google Maps embed URL"><input className={adminInput} value={content.mapEmbedUrl} onChange={(event) => field('mapEmbedUrl', event.target.value)} /></Field></div>
              <div className="sm:col-span-2"><Field label="Google Maps directions URL"><input className={adminInput} value={content.mapDirectionsUrl} onChange={(event) => field('mapDirectionsUrl', event.target.value)} /></Field></div>
            </div>
          </ContentSection>

          <ContentSection icon={Share2} eyebrow="Social" title="Public profile links">
            <div className="space-y-4">
              <Field label="Facebook"><input className={adminInput} value={content.facebookUrl} onChange={(event) => field('facebookUrl', event.target.value)} /></Field>
              <Field label="Instagram"><input className={adminInput} value={content.instagramUrl} onChange={(event) => field('instagramUrl', event.target.value)} /></Field>
              <Field label="TikTok"><input className={adminInput} value={content.tiktokUrl} onChange={(event) => field('tiktokUrl', event.target.value)} /></Field>
            </div>
          </ContentSection>
        </div>

        <aside className="xl:col-span-5 xl:sticky xl:top-0 xl:self-start">
          <section className={`${adminPanel} overflow-hidden`}>
            <div className="border-b border-white/[0.08] p-5">
              <p className="text-caption font-semibold uppercase tracking-label text-[#C4CEFF]">Live preview</p>
              <h2 className="mt-1 text-base font-semibold">Public contact block</h2>
            </div>
            <div className="space-y-5 p-5">
              <div>
                <p className="text-lg font-semibold">{content.studioName || 'Studio name'}</p>
                <p className="mt-2 text-sm text-white/55">{content.addressLine1 || 'Address'}</p>
                {content.addressLine2 ? <p className="text-sm text-white/55">{content.addressLine2}</p> : null}
                <p className="mt-3 text-sm font-medium text-white/80">{content.phoneNumber || 'Phone number'}</p>
                {content.businessHours ? <p className="mt-1 text-caption text-white/40">{content.businessHours}</p> : null}
              </div>
              <div className="aspect-[16/9] overflow-hidden rounded-xl border border-white/10 bg-black/20">
                {content.mapEmbedUrl ? <iframe title="Map preview" src={content.mapEmbedUrl} className="size-full border-0" loading="lazy" /> : null}
              </div>
              <a href={content.mapDirectionsUrl || '#'} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-xs font-semibold text-[#C4CEFF]">
                Check directions link <ExternalLink className="size-3.5" />
              </a>
            </div>
          </section>
        </aside>
      </div>

      <div className="sticky bottom-0 z-10 -mx-5 border-t border-white/[0.08] bg-[#222222]/95 px-5 py-4 backdrop-blur-xl md:-mx-8 md:px-8">
        <div className="flex justify-end">
          <button type="button" onClick={() => void save()} disabled={loading || saving} className={`${adminBtnPrimary} inline-flex items-center gap-2 px-5 py-3`}>
            <Save className="size-4" /> {saving ? 'Saving…' : 'Publish Content'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ContentSection({ icon: Icon, eyebrow, title, children }: { icon: typeof Smartphone; eyebrow: string; title: string; children: React.ReactNode }) {
  return <section className={`${adminPanel} p-5`}><div className="flex items-start gap-3"><div className="flex size-9 items-center justify-center rounded-lg border border-[#C4CEFF]/20 bg-[#C4CEFF]/[0.06] text-[#C4CEFF]"><Icon className="size-4" /></div><div><p className="text-caption font-semibold uppercase tracking-label text-white/35">{eyebrow}</p><h2 className="mt-1 text-sm font-semibold">{title}</h2></div></div><div className="mt-5">{children}</div></section>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-2"><span className={adminLabel}>{label}</span>{children}</label>
}
