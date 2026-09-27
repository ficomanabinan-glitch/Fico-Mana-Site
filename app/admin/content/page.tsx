'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Save } from 'lucide-react'
import AdminPageHeader from '@/components/admin-page-header'
import { useAdminToast } from '@/components/admin-toast-provider'
import { adminBtnPrimary, adminInput, adminLabel, adminPage, adminPanel, adminSelect } from '@/lib/admin-ui'
import { DEFAULT_WEBSITE_CONTENT, type WebsiteContent } from '@/lib/website-content'
import { WEBSITE_COPY_SECTIONS, type WebsiteCopyKey } from '@/lib/website-copy'
import { contentSchema } from '@/lib/website-content-validation'

const sections = [{ id: 'details', title: 'Contact, location & links' }, ...WEBSITE_COPY_SECTIONS]
const contactFields: { key: Exclude<keyof WebsiteContent, 'copy'>; label: string; type?: string; max: number; optional?: boolean }[] = [
  { key: 'studioName', label: 'Studio name', max: 80 },
  { key: 'phoneNumber', label: 'Mobile / telephone', type: 'tel', max: 40 },
  { key: 'publicEmail', label: 'Public email', type: 'email', max: 160, optional: true },
  { key: 'businessHours', label: 'Business hours', max: 200, optional: true },
  { key: 'addressLine1', label: 'Address line 1', max: 160 },
  { key: 'addressLine2', label: 'Address line 2', max: 160, optional: true },
  { key: 'mapEmbedUrl', label: 'Google Maps embed URL', type: 'url', max: 500 },
  { key: 'mapDirectionsUrl', label: 'Google Maps directions URL', type: 'url', max: 500 },
  { key: 'facebookUrl', label: 'Facebook', type: 'url', max: 500, optional: true },
  { key: 'instagramUrl', label: 'Instagram', type: 'url', max: 500, optional: true },
  { key: 'tiktokUrl', label: 'TikTok', type: 'url', max: 500, optional: true },
]

export default function ContentManagementPage() {
  const toast = useAdminToast()
  const [content, setContent] = useState<WebsiteContent>(DEFAULT_WEBSITE_CONTENT)
  const [saved, setSaved] = useState<WebsiteContent | null>(null)
  const [section, setSection] = useState('details')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState('')
  const dirty = saved !== null && JSON.stringify(content) !== JSON.stringify(saved)
  const activeSection = WEBSITE_COPY_SECTIONS.find(item => item.id === section)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const response = await fetch('/api/admin/website-content', { cache: 'no-store', credentials: 'include' })
      const body = await response.json().catch(() => ({})) as WebsiteContent & { error?: string }
      if (!response.ok || !body.copy) throw new Error(body.error || 'Could not load website content. Check that the CMS migration is installed.')
      setContent(body)
      setSaved(body)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Refresh and try again.')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const copyField = (key: WebsiteCopyKey, value: string) =>
    setContent(current => ({ ...current, copy: { ...current.copy, [key]: value } }))
  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!saved || saving || !dirty) return
    const validation = contentSchema.safeParse(content)
    if (!validation.success) {
      const issue = validation.error.issues[0]
      const group = WEBSITE_COPY_SECTIONS.find(item => item.fields.some(field => field.key === issue?.path[1]))
      setSection(issue?.path[0] === 'copy' ? group?.id || 'details' : 'details')
      toast.error('Check your content', issue?.message || 'Complete the required fields before publishing.')
      return
    }
    setSaving(true)
    try {
      const response = await fetch('/api/admin/website-content', {
        method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(content),
      })
      const body = await response.json().catch(() => ({})) as WebsiteContent & { error?: string }
      if (!response.ok || !body.copy) throw new Error(body.error || 'Could not confirm the saved content. Your changes are still here; try again.')
      setContent(body)
      setSaved(body)
      toast.success('Website content published', 'Refresh the public page to view the updated text, contact details, and policies.')
    } catch (error) {
      toast.error('Nothing was published', error instanceof Error ? error.message : 'Your changes are still here. Try again.')
    } finally { setSaving(false) }
  }

  return (
    <div className={`${adminPage} pb-[env(safe-area-inset-bottom,0px)]`}>
      <AdminPageHeader title="Content Management" subtitle="Edit website text, contact details, footer, and legal pages. Publishing saves all your changes." />
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/70">
        <Link className="underline underline-offset-4 hover:text-white" href="/admin/packages">Prices, packages & payment QR</Link>
        <Link className="underline underline-offset-4 hover:text-white" href="/admin/media">Website photos & video</Link>
        <a className="underline underline-offset-4 hover:text-white" href="https://www.ficomana.com" target="_blank" rel="noreferrer">View website</a>
      </div>
      {loadError ? <div role="alert" className={`${adminPanel} space-y-3 p-5`}><p>{loadError}</p><button type="button" onClick={() => void load()} className={`${adminBtnPrimary} px-5 py-3`}>Try again</button></div> : null}
      {loading ? <div aria-label="Loading website content" className={`${adminPanel} h-80 animate-pulse bg-white/5`} /> : !loadError ? (
        <div className="grid min-w-0 gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <nav aria-label="Content sections" className="min-w-0">
            <label className="block space-y-2 lg:hidden"><span className={adminLabel}>Edit section</span>
              <select className={adminSelect} value={section} onChange={event => setSection(event.target.value)}>
                {sections.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
              </select>
            </label>
            <div className="hidden space-y-1 lg:block">
              {sections.map(item => <button type="button" key={item.id} onClick={() => setSection(item.id)} aria-current={section === item.id ? 'page' : undefined}
                className={`min-h-11 w-full rounded-control px-4 py-3 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-[#C4CEFF] ${section === item.id ? 'bg-primary/15 font-semibold text-white' : 'text-white/70 hover:bg-white/5 hover:text-white'}`}>{item.title}</button>)}
            </div>
          </nav>
          <form onSubmit={save} className={`${adminPanel} min-w-0 overflow-hidden`}>
            <div className="border-b border-white/10 p-5 sm:p-6">
              <h2 className="text-lg font-semibold">{activeSection?.title || 'Contact, location & links'}</h2>
              <p className="mt-2 max-w-prose text-sm leading-relaxed text-white/70">
                {section === 'privacy' || section === 'terms' ? 'Existing policy wording is preserved. Use blank lines between paragraphs. Review policy changes before publishing; this does not change booking or payment rules.' :
                  section === 'details' ? 'These details appear in the public contact section, footer, and legal-page contact links.' :
                  'Edit the current wording below. Text is displayed safely as plain text; HTML is not supported.'}
              </p>
            </div>
            <fieldset disabled={saving} className="min-w-0 space-y-5 p-5 sm:p-6">
              {section === 'details' ? <div className="grid min-w-0 gap-5 sm:grid-cols-2">{contactFields.map(item => <div key={item.key} className={item.type === 'url' ? 'sm:col-span-2' : ''}>
                <Field label={item.label + (item.optional ? ' (optional)' : '')}>
                  <input type={item.type || 'text'} required={!item.optional} maxLength={item.max} className={adminInput} value={content[item.key]} onChange={event => setContent(current => ({ ...current, [item.key]: event.target.value }))} />
                </Field>
              </div>)}</div> : activeSection?.fields.map(item => (
                <Field key={item.key} label={item.label}>
                  {item.multiline ? <textarea required rows={item.key.endsWith('Body') ? 14 : 6} maxLength={item.maxLength} className={`${adminInput} resize-y leading-relaxed`} value={content.copy[item.key]} onChange={event => copyField(item.key, event.target.value)} /> :
                    <input required maxLength={item.maxLength} className={adminInput} value={content.copy[item.key]} onChange={event => copyField(item.key, event.target.value)} />}
                </Field>
              ))}
            </fieldset>
            <footer data-testid="cms-publish-footer" className="flex flex-col gap-4 border-t border-white/10 bg-white/[0.02] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <p role="status" className="text-sm text-white/70">{saving ? 'Publishing your changes…' : dirty ? 'You have unpublished changes.' : 'All changes are published.'}</p>
              <button type="submit" disabled={!dirty || saving} className={`${adminBtnPrimary} inline-flex w-full shrink-0 items-center justify-center gap-2 px-5 py-3 sm:w-auto`}><Save className="size-4" />{saving ? 'Publishing…' : 'Publish Content'}</button>
            </footer>
          </form>
        </div>
      ) : null}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block min-w-0 space-y-2"><span className={adminLabel}>{label}</span>{children}</label>
}
