'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Download, ExternalLink, FolderOpen, Search } from 'lucide-react'
import { useAdminToast } from '@/components/admin-toast-provider'
import { adminBtnGhost, adminBtnPrimary, adminInput, adminPanel } from '@/lib/admin-ui'

type GroupMode = 'day' | 'week' | 'month'
type StatusFilter = 'ALL' | 'WAITING_FOR_SELECTION' | 'READY_FOR_EDITING' | 'EDITING' | 'READY_TO_UPLOAD' | 'DELIVERED' | 'UPLOAD_FAILED'

type Batch = {
  id: string
  workspaceId: string
  shootDate: string
  locationKey: string
  status: string
  totalClients: number
  totalSelectedPhotos: number
  counts: { waitingForSelection: number; readyForEditing: number; downloaded: number; editing: number; readyToUpload: number; uploading: number; delivered: number; failed: number }
  clients: Array<{ bookingId: string; clientId: string; clientName: string; status: string; selectedCount: number }>
  driveDayFolderUrl: string
}

function parseDay(key: string) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key); return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12) : null }
function dayLabel(key: string) { const d = parseDay(key); return d ? d.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : key }
function monthKey(day: string) { return day.slice(0, 7) }
function monthLabel(key: string) { const d = parseDay(`${key}-01`); return d ? d.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }) : key }
function weekStart(day: string) { const d = parseDay(day); if (!d) return day; const delta = d.getDay() === 0 ? -6 : 1 - d.getDay(); d.setDate(d.getDate() + delta); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
function weekLabel(key: string) { const start = parseDay(key); if (!start) return key; const end = new Date(start); end.setDate(end.getDate()+6); return `${start.toLocaleDateString('en-PH',{month:'short',day:'numeric'})} – ${end.toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'})}` }
function statusCount(batch: Batch, filter: StatusFilter) {
  if (filter === 'ALL') return batch.totalClients
  if (filter === 'WAITING_FOR_SELECTION') return batch.counts.waitingForSelection
  if (filter === 'READY_FOR_EDITING') return batch.counts.readyForEditing
  if (filter === 'EDITING') return batch.counts.editing + batch.counts.downloaded
  if (filter === 'READY_TO_UPLOAD') return batch.counts.readyToUpload + batch.counts.uploading
  if (filter === 'DELIVERED') return batch.counts.delivered
  if (filter === 'UPLOAD_FAILED') return batch.counts.failed
  return 0
}

export default function EditorQueue() {
  const toast = useAdminToast()
  const [batches, setBatches] = useState<Batch[]>([])
  const [loading, setLoading] = useState(true)
  const [groupMode, setGroupMode] = useState<GroupMode>('day')
  const [filter, setFilter] = useState<StatusFilter>('ALL')
  const [search, setSearch] = useState('')
  const [downloading, setDownloading] = useState('')

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/editor-workflow/batches', { cache: 'no-store', credentials: 'include' })
      const body = await response.json().catch(() => [])
      if (!response.ok) throw new Error(body.error || 'Could not load editor batches.')
      setBatches(Array.isArray(body) ? body : [])
    } catch (error) { toast.error('Editor workflow unavailable', error instanceof Error ? error.message : 'Try again.') }
    finally { setLoading(false) }
  }, [toast])

  useEffect(() => { const saved = localStorage.getItem('fico-editor-group-mode'); if (saved === 'day' || saved === 'week' || saved === 'month') setGroupMode(saved); void load() }, [load])
  const chooseGrouping = (mode: GroupMode) => { setGroupMode(mode); localStorage.setItem('fico-editor-group-mode', mode) }

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return batches.filter((batch) => {
      if (statusCount(batch, filter) === 0) return false
      if (!term) return true
      return batch.id.toLowerCase().includes(term) || batch.shootDate.includes(term) || batch.clients.some((client) => client.clientName.toLowerCase().includes(term) || client.bookingId.toLowerCase().includes(term) || client.clientId.toLowerCase().includes(term))
    })
  }, [batches, filter, search])

  const grouped = useMemo(() => {
    const dayMap = new Map<string, Batch[]>()
    for (const batch of visible) { const rows = dayMap.get(batch.shootDate) || []; rows.push(batch); dayMap.set(batch.shootDate, rows) }
    const days = Array.from(dayMap.entries()).map(([day, rows]) => ({ day, batches: rows.sort((a,b)=>a.id.localeCompare(b.id)) })).sort((a,b)=>b.day.localeCompare(a.day))
    if (groupMode === 'day') return days.map((day) => ({ key: day.day, label: dayLabel(day.day), days: [day] }))
    const map = new Map<string, typeof days>()
    for (const day of days) { const key = groupMode === 'week' ? weekStart(day.day) : monthKey(day.day); const rows = map.get(key) || []; rows.push(day); map.set(key, rows) }
    return Array.from(map.entries()).map(([key, rows]) => ({ key, label: groupMode === 'week' ? `Week · ${weekLabel(key)}` : monthLabel(key), days: rows.sort((a,b)=>b.day.localeCompare(a.day)) })).sort((a,b)=>b.key.localeCompare(a.key))
  }, [visible, groupMode])

  const downloadBatch = async (batch: Batch) => {
    setDownloading(batch.id)
    const anchor = document.createElement('a')
    anchor.href = `/api/editor-workflow/batches/${encodeURIComponent(batch.id)}/download`
    anchor.download = `${batch.id}.zip`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    toast.success('Day batch started', 'Only READY FOR EDITING jobs are streamed into the ZIP.')
    window.setTimeout(() => { setDownloading(''); void load() }, 2500)
  }

  const totals = batches.reduce((acc,batch)=>{ acc.clients += batch.totalClients; acc.ready += batch.counts.readyForEditing; acc.editing += batch.counts.editing + batch.counts.downloaded; acc.failed += batch.counts.failed; return acc }, {clients:0,ready:0,editing:0,failed:0})

  return <div className="space-y-5">
    <div className={`${adminPanel} p-4 space-y-4`}>
      <div className="grid gap-3 xl:grid-cols-[1fr_auto]">
        <div className="relative"><Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-white/35"/><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search Client Name, Booking ID, Batch ID, or Shoot Date…" className={`${adminInput} pl-11`}/></div>
        <div className="flex items-center gap-1 rounded-lg border border-white/[0.07] bg-black/25 p-1"><span className="px-2 text-[9px] font-bold uppercase tracking-wider text-white/30">Group by</span>{([['day','Day'],['week','Week'],['month','Month']] as const).map(([mode,label])=><button key={mode} onClick={()=>chooseGrouping(mode)} className={`rounded-md px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider ${groupMode===mode?'bg-primary text-white':'text-white/45 hover:bg-white/5 hover:text-white'}`}>{label}</button>)}</div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><MiniMetric label="Clients" value={totals.clients}/><MiniMetric label="Ready" value={totals.ready} accent="text-emerald-300"/><MiniMetric label="Editing" value={totals.editing} accent="text-amber-300"/><MiniMetric label="Failed" value={totals.failed} accent="text-red-300"/></div>
      <div className="flex flex-wrap gap-1 rounded-lg border border-white/[0.06] bg-black/25 p-1">{([['ALL','All'],['WAITING_FOR_SELECTION','Waiting for Selection'],['READY_FOR_EDITING','Ready for Editing'],['EDITING','Editing'],['READY_TO_UPLOAD','Ready to Upload'],['DELIVERED','Delivered'],['UPLOAD_FAILED','Upload Failed']] as const).map(([id,label])=><button key={id} onClick={()=>setFilter(id)} className={`rounded-md px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider ${filter===id?'bg-primary text-white':'text-white/45 hover:bg-white/5 hover:text-white'}`}>{label}</button>)}</div>
    </div>
    <div className="border border-[#C4CEFF]/15 bg-[#C4CEFF]/[0.04] p-4 text-[10px] leading-relaxed text-white/45">Every day is an <strong className="text-white/70">Editing Batch</strong> with a stable batch ID. Day / Week / Month only changes the view; the shoot date, booking/client IDs, Drive folder IDs, and batch ID stay unchanged.</div>
    {loading ? <div className={`${adminPanel} p-14 text-center text-sm text-white/35`}>Loading editing batches…</div> : grouped.length===0 ? <div className={`${adminPanel} p-14 text-center`}><CheckCircle2 className="mx-auto size-8 text-emerald-400/45"/><p className="mt-3 text-sm font-semibold">No batches match this view</p></div> : <div className="space-y-7">{grouped.map((group)=><section key={group.key} className="space-y-4">{groupMode!=='day'?<div className="border-b border-white/[0.08] pb-2"><p className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/30">{groupMode==='week'?'Calendar Week':'Shoot Month'}</p><h2 className="mt-1 text-base font-semibold">{group.label}</h2></div>:null}{group.days.map((day)=><div key={day.day} className="space-y-3">{groupMode!=='day'?<div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-white/75">{dayLabel(day.day)}</h3><span className="text-[9px] font-mono text-white/30">{day.batches.length} batch</span></div>:null}<div className="grid gap-4">{day.batches.map((batch)=><BatchCard key={batch.id} batch={batch} downloading={downloading===batch.id} onDownload={()=>void downloadBatch(batch)}/>)}</div></div>)}</section>)}</div>}
  </div>
}

function MiniMetric({label,value,accent='text-white'}:{label:string;value:number;accent?:string}) { return <div className="border border-white/[0.07] bg-black/10 p-3"><p className="text-[8px] font-bold uppercase tracking-wider text-white/30">{label}</p><p className={`mt-1 text-lg font-bold ${accent}`}>{value}</p></div> }

function BatchCard({batch,downloading,onDownload}:{batch:Batch;downloading:boolean;onDownload:()=>void}) {
  const stats = [['Total Clients',batch.totalClients],['Selected Photos',batch.totalSelectedPhotos],['Waiting Selection',batch.counts.waitingForSelection],['Ready for Editing',batch.counts.readyForEditing],['Editing',batch.counts.editing+batch.counts.downloaded],['Ready to Upload',batch.counts.readyToUpload],['Delivered',batch.counts.delivered],['Failed Uploads',batch.counts.failed]] as const
  return <article className={`${adminPanel} overflow-hidden`}>
    <div className="flex flex-col gap-4 border-b border-white/[0.08] p-5 xl:flex-row xl:items-start xl:justify-between"><div><div className="flex items-center gap-2"><FolderOpen className="size-4 text-[#C4CEFF]"/><span className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#C4CEFF]">Editing Batch</span></div><h2 className="mt-2 text-xl font-semibold">{dayLabel(batch.shootDate)}</h2><p className="mt-1 font-mono text-[10px] text-white/35">{batch.id}</p></div><div className="flex flex-wrap gap-2"><button onClick={onDownload} disabled={batch.counts.readyForEditing===0||downloading} className={`${adminBtnPrimary} inline-flex items-center gap-1.5 px-3 py-2 disabled:opacity-35`}><Download className="size-3.5"/>{downloading?'Preparing…':'Download Day Batch'}</button>{batch.driveDayFolderUrl?<a href={batch.driveDayFolderUrl} target="_blank" rel="noopener noreferrer" className={`${adminBtnGhost} inline-flex items-center gap-1.5 px-3 py-2`}>Open Day in Drive <ExternalLink className="size-3.5"/></a>:<Link href="/admin/provisioning" className={`${adminBtnGhost} inline-flex items-center gap-1.5 px-3 py-2`}>Connect Google Drive</Link>}<Link href={`/admin/filtering/batch/${encodeURIComponent(batch.id)}`} className={`${adminBtnGhost} inline-flex items-center gap-1.5 px-3 py-2`}>Open Batch</Link></div></div>
    <div className="grid grid-cols-2 gap-px bg-white/[0.06] sm:grid-cols-4 xl:grid-cols-8">{stats.map(([label,value])=><div key={label} className="bg-[#222222] p-3"><p className="text-[8px] font-bold uppercase tracking-wider text-white/25">{label}</p><p className={`mt-1 text-lg font-bold ${label==='Failed Uploads'&&value>0?'text-red-300':'text-white'}`}>{value}</p></div>)}</div>
    {batch.counts.failed>0?<div className="flex items-center gap-2 border-t border-red-500/15 bg-red-500/[0.04] px-4 py-3 text-[10px] text-red-200/70"><AlertTriangle className="size-3.5"/>Some client uploads failed. Open the batch to inspect and retry failed clients only.</div>:null}
  </article>
}
