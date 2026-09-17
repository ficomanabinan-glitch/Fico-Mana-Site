'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { ArrowLeft, ExternalLink, FileImage, Folder, ImagePlus, RefreshCw, Search, Trash2, X } from 'lucide-react'
import EditorCapabilityGate from '@/components/editor-capability-gate'
import { uploadRawDirect } from '@/lib/raw-upload-client'
import { invalidateStaffPages, readStaffPage, staffPageCacheGeneration, writeStaffPage } from '@/lib/staff-page-cache'
import FileDeleteDialog from '@/components/file-delete-dialog'

type Item = Record<string, any>
type View = { level: 'dates' | 'clients' | 'categories' | 'files'; items: Item[]; shootDate?: string; booking?: Item }
type UploadState = { fileName: string; complete: number; total: number; percent: number }

const categoryLabels: Record<string, string> = {
  raw: 'Original photos', original: 'Original photos', preview: 'Previews', thumbnail: 'Thumbnails',
  enhanced: 'Enhanced photos', deliverable: 'Final deliverables', print: 'Print files', temporary: 'Temporary files',
}

function sizeLabel(bytes: number) {
  if (!bytes) return 'Size unavailable'
  const units = ['B', 'KB', 'MB', 'GB']
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** unit).toFixed(unit ? 1 : 0)} ${units[unit]}`
}

function FileManagement() {
  const [date, setDate] = useState('')
  const [booking, setBooking] = useState('')
  const [category, setCategory] = useState('')
  const [data, setData] = useState<View | null>(null)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [notice, setNotice] = useState('')
  const [upload, setUpload] = useState<UploadState | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Item | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const uploadInput = useRef<HTMLInputElement>(null)
  const query = new URLSearchParams({ ...(date ? { date } : {}), ...(booking ? { booking } : {}), ...(category ? { category } : {}) }).toString()

  useEffect(() => {
    const controller = new AbortController()
    const generation = staffPageCacheGeneration()
    const key = `editor-files:${query}`
    const cached = readStaffPage<{ view: View; at: number; revision: number }>(key)
    if (cached && cached.revision === refresh && Date.now() - cached.at < 30_000) {
      setData(cached.view); setError('')
      return () => controller.abort()
    }
    setData(null); setError('')
    fetch(`/api/editor-files${query ? `?${query}` : ''}`, { credentials: 'include', cache: 'no-store', signal: controller.signal })
      .then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Could not load files.'); return body })
      .then((view: View) => {
        if (controller.signal.aborted || generation !== staffPageCacheGeneration()) return
        writeStaffPage(key, { view, at: Date.now(), revision: refresh }, generation)
        setData(view)
      }).catch((cause) => { if (cause.name !== 'AbortError') setError(cause.message) })
    return () => controller.abort()
  }, [query, refresh])

  const back = () => {
    if (category) setCategory('')
    else if (booking) setBooking('')
    else if (date) setDate('')
  }
  const title = category ? categoryLabels[category] || category.replace(/^./, (value) => value.toUpperCase()) : booking ? data?.booking?.customer_name || booking : date || 'Files Management'
  const visibleItems = useMemo(() => {
    const term = search.trim().toLocaleLowerCase()
    if (!term || !data) return data?.items || []
    return data.items.filter((item) => [item.date, item.customer_name, item.package_name, item.name, item.fileName]
      .some((value) => String(value || '').toLocaleLowerCase().includes(term)))
  }, [data, search])
  useEffect(() => setSearch(''), [query])
  const level = data?.level
  const canAddOriginals = level === 'files' && category === 'raw' && Boolean(booking)

  async function addOriginals(files: FileList | null) {
    if (!files?.length || !booking || upload) return
    setError(''); setNotice('')
    const failures: string[] = []
    const selected = Array.from(files)
    setUpload({ fileName: selected[0].name, complete: 0, total: selected.length, percent: 0 })
    for (let index = 0; index < selected.length; index += 1) {
      const file = selected[index]
      try {
        await uploadRawDirect(booking, file, (loaded, total) => setUpload({
          fileName: file.name, complete: index, total: selected.length,
          percent: total ? Math.round((loaded / total) * 100) : 0,
        }))
      } catch (cause) {
        failures.push(`${file.name}: ${cause instanceof Error ? cause.message : 'Upload failed.'}`)
      }
    }
    setUpload(null)
    invalidateStaffPages('editor-files:')
    if (uploadInput.current) uploadInput.current.value = ''
    if (failures.length) setError(failures.join(' '))
    else setNotice(`${selected.length} ${selected.length === 1 ? 'photo' : 'photos'} added.`)
    setRefresh((value) => value + 1)
  }

  async function deleteFile() {
    if (!deleteTarget) return
    setDeleting(true); setDeleteError(''); setNotice('')
    try {
      const response = await fetch(`/api/editor-files?source=${encodeURIComponent(deleteTarget.source)}&file=${encodeURIComponent(deleteTarget.id)}`, {
        method: 'DELETE', credentials: 'include', headers: { Accept: 'application/json' },
      })
      const body = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(body.error || 'The file could not be deleted.')
      invalidateStaffPages('editor-files:')
      setDeleteTarget(null); setNotice(`${deleteTarget.fileName} deleted.`); setRefresh((value) => value + 1)
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : 'The file could not be deleted.')
    } finally { setDeleting(false) }
  }

  return <div className="mx-auto w-full max-w-[1500px]">
    <header className="mb-6 flex flex-col gap-4 border-b border-white/[0.08] pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div>{date ? <button onClick={back} className="mb-3 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-xs font-semibold text-white/65 outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-[#C4CEFF]"><ArrowLeft className="size-3.5"/>Back</button> : null}
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-white">{title}</h1>
        <p className="mt-1 max-w-[65ch] text-sm text-white/65">Open a folder to load its contents. Photos stay private until you open one.</p>
      </div>
      {canAddOriginals ? <><input ref={uploadInput} type="file" multiple className="sr-only" accept="image/*,.dng,.cr2,.cr3,.nef,.arw,.orf,.rw2,.raf" onChange={(event) => void addOriginals(event.target.files)}/><button type="button" onClick={() => uploadInput.current?.click()} disabled={Boolean(upload)} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#C4CEFF] px-4 text-sm font-semibold text-[#11131A] outline-none transition hover:bg-white focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#171717] disabled:cursor-wait disabled:opacity-60"><ImagePlus className="size-4"/>{upload ? 'Uploading…' : 'Add photos'}</button></> : null}
    </header>
    {upload ? <div aria-live="polite" className="mb-4 rounded-xl border border-[#C4CEFF]/20 bg-[#C4CEFF]/[0.07] p-4"><div className="flex items-center justify-between gap-4 text-sm"><span className="min-w-0 truncate text-white/75">Adding {upload.fileName}</span><span className="shrink-0 tabular-nums text-[#C4CEFF]">{upload.complete + 1}/{upload.total} · {upload.percent}%</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#C4CEFF] transition-[width]" style={{ width: `${upload.percent}%` }}/></div></div> : null}
    {notice ? <div role="status" className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-emerald-300/20 bg-emerald-300/[0.07] p-4 text-sm text-emerald-100"><span>{notice}</span><button type="button" onClick={() => setNotice('')} aria-label="Dismiss message" className="grid size-11 shrink-0 place-items-center rounded-lg text-emerald-100/65 outline-none hover:bg-white/5 hover:text-white focus-visible:ring-2 focus-visible:ring-emerald-200"><X className="size-4"/></button></div> : null}
    {error ? <div role="alert" className="flex flex-col gap-3 rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-100 sm:flex-row sm:items-center sm:justify-between"><span>{error}</span><button onClick={() => setRefresh((value) => value + 1)} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-red-200/20 px-3 font-semibold hover:bg-red-100/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200"><RefreshCw className="size-4"/>Try again</button></div> : null}
    {!data && !error ? <div aria-label="Loading folder" aria-busy="true" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <div key={index} className="flex min-h-24 animate-pulse items-center gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5"><span className="size-11 rounded-xl bg-white/[0.07]"/><span className="flex-1"><span className="block h-3 w-2/3 rounded bg-white/[0.08]"/><span className="mt-3 block h-2.5 w-1/3 rounded bg-white/[0.05]"/></span></div>)}</div> : null}
    {data && !data.items.length ? <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-10 text-center"><Folder className="mx-auto size-8 text-white/25"/><p className="mt-3 text-sm text-white/65">This folder is empty.</p></div> : null}
    {data && data.items.length > 8 ? <label className="relative mb-4 block max-w-md"><span className="sr-only">Search this folder</span><Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-white/65"/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search this folder" className="min-h-11 w-full rounded-xl border border-white/[0.09] bg-white/[0.025] pl-10 pr-4 text-sm text-white outline-none placeholder:text-white/65 focus:border-[#C4CEFF]/45 focus:ring-2 focus:ring-[#C4CEFF]/15"/></label> : null}
    {data && search && !visibleItems.length ? <p className="rounded-xl border border-white/[0.08] p-6 text-center text-sm text-white/65">No matching files or folders.</p> : null}
    {level && level !== 'files' && visibleItems.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{visibleItems.map((item) => {
      const key = item.date || item.id || item.name
      const label = item.date || item.customer_name || categoryLabels[item.name] || item.name
      const count = item.fileCount ?? item.count
      return <button key={key} onClick={() => { if (level === 'dates') setDate(item.date); else if (level === 'clients') setBooking(item.id); else setCategory(item.name) }}
        className="group flex min-h-24 items-center gap-4 rounded-2xl border border-white/[0.09] bg-white/[0.025] p-5 text-left outline-none transition hover:border-[#C4CEFF]/35 hover:bg-white/[0.045] focus-visible:ring-2 focus-visible:ring-[#C4CEFF]">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#C4CEFF]/10 text-[#C4CEFF]"><Folder className="size-5"/></span>
        <span className="min-w-0"><strong className="block truncate text-sm text-white">{label}</strong><span className="mt-1 block text-xs text-white/65">{count} {count === 1 ? 'file' : 'files'}{item.package_name ? ` · ${item.package_name}` : ''}</span></span>
      </button>
    })}</div> : null}
    {level === 'files' && visibleItems.length ? <div className="divide-y divide-white/[0.07] overflow-hidden rounded-2xl border border-white/[0.09]">{visibleItems.map((item) => <div key={`${item.source}-${item.id}`} className="group flex items-center gap-3 bg-white/[0.02] p-3 transition hover:bg-white/[0.035] sm:gap-4 sm:p-4">
      {item.previewAvailable ? <a href={`/api/editor-files?source=${encodeURIComponent(item.source)}&file=${encodeURIComponent(item.id)}`} target="_blank" rel="noreferrer" aria-label={`Preview ${item.fileName}`} className="relative block size-14 shrink-0 overflow-hidden rounded-xl bg-white/[0.05] outline-none focus-visible:ring-2 focus-visible:ring-[#C4CEFF]"><Image src={`/api/editor-files?source=${encodeURIComponent(item.source)}&file=${encodeURIComponent(item.id)}&preview=1`} alt="" width={56} height={56} unoptimized className="size-full object-cover"/><span className="pointer-events-none absolute inset-0 rounded-xl border border-white/10"/></a> : <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-white/[0.05] text-white/65"><FileImage className="size-5"/></span>}
      <span className="min-w-0 flex-1"><strong className="block truncate text-sm font-medium">{item.fileName}</strong><span className="mt-1 block text-xs text-white/65">{sizeLabel(item.size)}</span></span>
      <div className="flex shrink-0 items-center gap-1"><a href={`/api/editor-files?source=${encodeURIComponent(item.source)}&file=${encodeURIComponent(item.id)}`} target="_blank" rel="noreferrer" aria-label={`Open ${item.fileName}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-white/10 px-3 text-xs font-semibold text-white/65 outline-none hover:bg-white/5 hover:text-white focus-visible:ring-2 focus-visible:ring-[#C4CEFF]"><span className="hidden sm:inline">Open</span><ExternalLink className="size-3.5"/></a><button type="button" onClick={() => setDeleteTarget(item)} aria-label={`Delete ${item.fileName}`} className="grid size-11 place-items-center rounded-xl text-white/65 outline-none hover:bg-red-400/10 hover:text-red-200 focus-visible:ring-2 focus-visible:ring-red-200"><Trash2 className="size-4"/></button></div>
    </div>)}</div> : null}
    <FileDeleteDialog fileName={deleteTarget?.fileName ?? null} busy={deleting} error={deleteError} onClose={() => { if (!deleting) { setDeleteTarget(null); setDeleteError('') } }} onDelete={() => void deleteFile()}/>
  </div>
}

export default function EditorFilesPage() {
  return <EditorCapabilityGate capability="edit" fallback="/editor/onsite"><FileManagement/></EditorCapabilityGate>
}
