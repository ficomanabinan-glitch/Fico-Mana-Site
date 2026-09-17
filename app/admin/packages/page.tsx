'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  ExternalLink,
  Eye,
  EyeOff,
  Image as ImageIcon,
  PackagePlus,
  Pencil,
  Save,
  Search,
  X,
} from 'lucide-react'
import AdminPageHeader from '@/components/admin-page-header'
import { useAdminToast } from '@/components/admin-toast-provider'
import AddonCatalogManager from '@/components/addon-catalog-manager'
import {
  BOOKING_PACKAGE_CATEGORY_LABELS,
  type BookingPackageCategory,
} from '@/lib/booking-packages'
import {
  adminBtnGhost,
  adminBtnPrimary,
  adminInput,
  adminLabel,
  adminPage,
  adminPanel,
  adminSelect,
} from '@/lib/admin-ui'
import {
  fetchManagedPackages,
  getCachedManagedPackages,
  getRememberedPackageManagerUi,
  isManagedPackageCacheFresh,
  rememberManagedPackage,
  rememberPackageManagerUi,
  type ManagedPackage,
  type PackageCategoryFilter,
} from '@/lib/package-manager-cache'

type PackageDraft = {
  id: string
  category: BookingPackageCategory
  title: string
  priceAmount: string
  duration: string
  description: string
  featuresText: string
  slotType: 'makeup' | 'standard'
  selectionLimit: string
  note: string
  isActive: boolean
  sortOrder: string
}

const emptyDraft = (): PackageDraft => ({
  id: '',
  category: 'self-portrait',
  title: '',
  priceAmount: '',
  duration: '',
  description: '',
  featuresText: '',
  slotType: 'standard',
  selectionLimit: '5',
  note: '',
  isActive: true,
  sortOrder: '100',
})

function toDraft(pkg: ManagedPackage): PackageDraft {
  return {
    id: pkg.id,
    category: pkg.category,
    title: pkg.title,
    priceAmount: String(pkg.priceAmount),
    duration: pkg.duration || '',
    description: pkg.description || '',
    featuresText: pkg.features.join('\n'),
    slotType: pkg.slotType,
    selectionLimit: String(pkg.selectionLimit),
    note: pkg.note || '',
    isActive: pkg.isActive,
    sortOrder: String(pkg.sortOrder),
  }
}

function packagePayload(draft: PackageDraft) {
  return {
    id: draft.id.trim().toLowerCase(),
    category: draft.category,
    title: draft.title.trim(),
    priceAmount: Number(draft.priceAmount),
    duration: draft.duration.trim(),
    description: draft.description.trim(),
    features: draft.featuresText.split('\n').map((item) => item.trim()).filter(Boolean),
    slotType: draft.slotType,
    selectionLimit: Number(draft.selectionLimit),
    note: draft.note.trim(),
    isActive: draft.isActive,
    sortOrder: Number(draft.sortOrder),
  }
}

export default function PackageManagerPage() {
  const toast = useAdminToast()
  const initialUiRef = useRef(getRememberedPackageManagerUi())
  const initialPackages = getCachedManagedPackages()
  const [packages, setPackages] = useState<ManagedPackage[]>(() => initialPackages ?? [])
  const [loading, setLoading] = useState(() => initialPackages === null)
  const [refreshing, setRefreshing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState(initialUiRef.current.search)
  const [category, setCategory] = useState<PackageCategoryFilter>(initialUiRef.current.category)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<PackageDraft | null>(null)

  const load = useCallback(async ({ force = false }: { force?: boolean } = {}) => {
    const cached = getCachedManagedPackages()
    if (cached) setPackages(cached)
    if (!force && cached && isManagedPackageCacheFresh()) {
      setLoading(false)
      setRefreshing(false)
      return
    }

    setRefreshing(Boolean(cached))
    try {
      setPackages(await fetchManagedPackages({ force }))
    } catch (error) {
      toast.error('Packages unavailable', error instanceof Error ? error.message : 'Try again.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [toast])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    rememberPackageManagerUi({ search, category })
  }, [category, search])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return packages.filter((pkg) => {
      const matchesCategory = category === 'all' || pkg.category === category
      const matchesSearch = !term || [pkg.id, pkg.title, pkg.description || ''].some((value) => value.toLowerCase().includes(term))
      return matchesCategory && matchesSearch
    })
  }, [category, packages, search])

  const startCreate = () => {
    setEditingId(null)
    setDraft(emptyDraft())
  }

  const startEdit = (pkg: ManagedPackage) => {
    setEditingId(pkg.id)
    setDraft(toDraft(pkg))
  }

  const closeEditor = () => {
    if (saving) return
    setEditingId(null)
    setDraft(null)
  }

  const save = async () => {
    if (!draft) return
    setSaving(true)
    try {
      const response = await fetch('/api/admin/packages', {
        method: editingId ? 'PATCH' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(packagePayload(draft)),
      })
      const body = (await response.json().catch(() => ({}))) as ManagedPackage & { error?: string }
      if (!response.ok) throw new Error(body.error || 'Could not save the package.')
      toast.success(
        editingId ? 'Package updated' : 'Package created',
        `${body.title} is ${body.isActive ? 'live on the website' : 'saved but hidden'}.`,
      )
      setPackages(rememberManagedPackage(body))
      setEditingId(body.id)
      setDraft(toDraft(body))
    } catch (error) {
      toast.error('Package not saved', error instanceof Error ? error.message : 'Try again.')
    } finally {
      setSaving(false)
    }
  }

  const pageHeader = (
    <AdminPageHeader
      title="Package Manager"
      subtitle="Update your packages, prices, and photo limits."
      onRefresh={() => void load({ force: true })}
      refreshing={refreshing}
    >
      <div className="flex flex-wrap gap-2">
        <Link href="https://www.ficomana.com/#pricing" target="_blank" className={`${adminBtnGhost} inline-flex items-center gap-2 px-4 py-3`}>
          View Website <ExternalLink className="size-3.5" />
        </Link>
        <button type="button" onClick={startCreate} className={`${adminBtnPrimary} inline-flex items-center gap-2 px-4 py-3`}>
          <PackagePlus className="size-3.5" /> Add Package
        </button>
      </div>
    </AdminPageHeader>
  )

  const packageFilters = (
    <section className={`${adminPanel} p-4`}>
      <div className="grid gap-3 md:grid-cols-[1fr_220px]">
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/30" />
          <input aria-label="Search packages" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search package name or ID…" className={`${adminInput} pl-10`} />
        </label>
        <select aria-label="Package category" value={category} onChange={(event) => setCategory(event.target.value as PackageCategoryFilter)} className={adminSelect}>
          <option value="all">All categories</option>
          {Object.entries(BOOKING_PACKAGE_CATEGORY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>
    </section>
  )

  if (loading && packages.length === 0) {
    return (
      <div className={adminPage}>
        {pageHeader}
        {packageFilters}
        <PackageBodySkeleton />
      </div>
    )
  }

  const activeCount = packages.filter((pkg) => pkg.isActive).length
  const selectionCounts = new Set(packages.map((pkg) => pkg.selectionLimit)).size

  return (
    <div className={adminPage}>
      {pageHeader}

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Total Packages" value={packages.length} detail="Preserved for existing bookings" />
        <SummaryCard label="Visible on Website" value={activeCount} detail={`${packages.length - activeCount} hidden`} />
        <SummaryCard label="Selection Rules" value={selectionCounts} detail="Package-based photo limits" />
      </div>

      <section className="rounded-xl border border-[#C4CEFF]/20 bg-[#0500D0]/10 p-4">
        <div className="flex gap-3">
          <ImageIcon className="mt-0.5 size-5 shrink-0 text-[#C4CEFF]" />
          <div>
            <p className="text-xs font-semibold text-white">Photo selection follows the package</p>
            <p className="mt-1 text-caption leading-relaxed text-white/50">
              A changed photo count applies to new bookings and open client selections. Submitted selections remain locked so approved work is never altered.
            </p>
          </div>
        </div>
      </section>

      {packageFilters}

      <div className="grid gap-4 lg:grid-cols-2">
        {filtered.map((pkg) => (
          <article key={pkg.id} className={`${adminPanel} p-5`}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-semibold text-white">{pkg.title}</p>
                  <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-caption font-semibold uppercase ${pkg.isActive ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-white/15 bg-white/5 text-white/40'}`}>
                    {pkg.isActive ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
                    {pkg.isActive ? 'Live' : 'Hidden'}
                  </span>
                </div>
                <p className="mt-1 font-mono text-caption text-white/30">{pkg.id}</p>
              </div>
              <button type="button" onClick={() => startEdit(pkg)} className={`${adminBtnGhost} inline-flex shrink-0 items-center gap-1.5 px-3 py-2`}>
                <Pencil className="size-3.5" /> Edit
              </button>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-3 border-t border-white/10 pt-4">
              <PackageFact label="Price" value={pkg.price} />
              <PackageFact label="Client Selects" value={`${pkg.selectionLimit} photos`} />
              <PackageFact label="Schedule" value={pkg.slotType === 'makeup' ? 'Timed slots' : 'Anytime'} />
            </div>
            <p className="mt-4 text-caption uppercase tracking-wider text-white/35">
              {BOOKING_PACKAGE_CATEGORY_LABELS[pkg.category]} · Order {pkg.sortOrder}
            </p>
          </article>
        ))}
        {filtered.length === 0 ? (
          <div className={`${adminPanel} col-span-full p-10 text-center text-sm text-white/40`}>No packages match these filters.</div>
        ) : null}
      </div>

      <AddonCatalogManager />

      {draft ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/75 backdrop-blur-sm">
          <button type="button" aria-label="Close package editor" className="absolute inset-0" onClick={closeEditor} />
          <aside className="relative z-10 flex h-full w-full max-w-2xl flex-col overflow-hidden border-l border-white/10 bg-[#222222] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div>
                <p className="text-caption font-semibold uppercase tracking-label text-[#C4CEFF]">System Management</p>
                <h2 className="mt-1 text-lg font-semibold">{editingId ? 'Edit Package' : 'Add Package'}</h2>
              </div>
              <button type="button" onClick={closeEditor} className="rounded-lg p-2 text-white/45 hover:bg-white/5 hover:text-white" aria-label="Close editor">
                <X className="size-5" />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Package ID" hint={editingId ? 'IDs stay fixed to protect booking links.' : 'Example: fico-5. Self Portrait IDs or names must begin with FICO or MANA.'}>
                  <input value={draft.id} disabled={Boolean(editingId)} onChange={(event) => setDraft({ ...draft, id: event.target.value.toLowerCase().replace(/\s+/g, '-') })} className={adminInput} placeholder="package-id" />
                </Field>
                <Field label="Category">
                  <select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as BookingPackageCategory })} className={adminSelect}>
                    {Object.entries(BOOKING_PACKAGE_CATEGORY_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="Package Name">
                <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className={adminInput} placeholder="FICO 5 — Solo or Duo" />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Price (PHP)">
                  <input type="number" min="0" step="1" value={draft.priceAmount} onChange={(event) => setDraft({ ...draft, priceAmount: event.target.value })} className={adminInput} placeholder="1500" />
                </Field>
                <Field label="Photos Client Must Select">
                  <input type="number" min="1" max="200" step="1" value={draft.selectionLimit} onChange={(event) => setDraft({ ...draft, selectionLimit: event.target.value })} className={adminInput} />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Duration">
                  <input value={draft.duration} onChange={(event) => setDraft({ ...draft, duration: event.target.value })} className={adminInput} placeholder="20 mins studio shoot" />
                </Field>
                <Field label="Schedule Type">
                  <select value={draft.slotType} onChange={(event) => setDraft({ ...draft, slotType: event.target.value as PackageDraft['slotType'] })} className={adminSelect}>
                    <option value="standard">Anytime / standard capacity</option>
                    <option value="makeup">Timed studio slots</option>
                  </select>
                </Field>
              </div>

              <Field label="Short Description">
                <textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} rows={3} className={adminInput} placeholder="Shown beneath the package name on the website." />
              </Field>

              <Field label="Package Inclusions" hint="One inclusion per line. These appear on the public website.">
                <textarea value={draft.featuresText} onChange={(event) => setDraft({ ...draft, featuresText: event.target.value })} rows={9} className={`${adminInput} font-mono text-xs`} placeholder={'15 mins studio shoot\nYour choice of backdrop\n5 enhanced photos'} />
              </Field>

              <Field label="Package Note">
                <textarea value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} rows={2} className={adminInput} placeholder="Optional terms or additional charges." />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Website Display Order">
                  <input type="number" min="0" max="9999" step="1" value={draft.sortOrder} onChange={(event) => setDraft({ ...draft, sortOrder: event.target.value })} className={adminInput} />
                </Field>
                <Field label="Website Visibility">
                  <button type="button" onClick={() => setDraft({ ...draft, isActive: !draft.isActive })} className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-xs font-semibold ${draft.isActive ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-white/15 bg-white/5 text-white/45'}`}>
                    <span>{draft.isActive ? 'Visible and bookable' : 'Hidden from website'}</span>
                    {draft.isActive ? <Check className="size-4" /> : <EyeOff className="size-4" />}
                  </button>
                </Field>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-white/10 bg-[#222222] p-5 sm:flex-row sm:justify-end">
              <button type="button" onClick={closeEditor} disabled={saving} className={`${adminBtnGhost} px-5 py-3`}>Cancel</button>
              <button type="button" onClick={() => void save()} disabled={saving} className={`${adminBtnPrimary} inline-flex items-center justify-center gap-2 px-5 py-3`}>
                <Save className="size-4" /> {saving ? 'Saving…' : 'Save Package'}
              </button>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  )
}

function SummaryCard({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className={`${adminPanel} p-5`}>
      <p className="text-caption font-semibold uppercase tracking-label text-white/35">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-white">{value}</p>
      <p className="mt-1 text-caption text-white/40">{detail}</p>
    </div>
  )
}

function PackageBodySkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-label="Loading package catalog">
      <div className="grid gap-3 sm:grid-cols-3">
        {['total', 'visible', 'selection'].map((key) => (
          <div key={key} className={`${adminPanel} h-[108px] p-5`}>
            <div className="h-3 w-24 rounded bg-white/[0.08]" />
            <div className="mt-4 h-7 w-16 rounded bg-white/[0.08]" />
            <div className="mt-3 h-3 w-36 rounded bg-white/[0.06]" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {['package-a', 'package-b', 'package-c', 'package-d'].map((key) => (
          <div key={key} className={`${adminPanel} h-[190px] p-5`}>
            <div className="h-4 w-40 rounded bg-white/[0.08]" />
            <div className="mt-3 h-3 w-24 rounded bg-white/[0.06]" />
            <div className="mt-8 grid grid-cols-3 gap-3 border-t border-white/10 pt-4">
              <div className="h-9 rounded bg-white/[0.06]" />
              <div className="h-9 rounded bg-white/[0.06]" />
              <div className="h-9 rounded bg-white/[0.06]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function PackageFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-caption font-semibold uppercase tracking-wider text-white/30">{label}</p>
      <p className="mt-1 text-xs font-semibold text-white/75">{value}</p>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className={adminLabel}>{label}</span>
      {children}
      {hint ? <span className="block text-caption leading-relaxed text-white/35">{hint}</span> : null}
    </label>
  )
}
