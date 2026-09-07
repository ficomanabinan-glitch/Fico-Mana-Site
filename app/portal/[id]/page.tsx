'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import {
  CalendarDays, CheckCircle2, Download, ExternalLink, FileText, Package, WalletCards,
} from 'lucide-react'
import ClientPortalTrustedDevice from '@/components/client-portal-trusted-device'
import PortalQrCode from '@/components/portal-qr-code'
import {
  ClientPhotoSelection,
  type ClientAddon,
  type ClientGalleryFile,
  type ClientSelection,
} from '@/components/client-photo-selection'

type PortalResource={id:string;resource_type:string;title:string;url?:string|null;content?:string|null;created_at:string}
type PortalData={
  booking:{id:string;customerName:string;packageName:string;bookingDate:string;bookingTime:string;bookingStatus:string;paymentStatus:string;price:number;depositAmount:number;amountPaid:number}
  portalId:string
  shareUrl:string
  selection:ClientSelection|null
  gallery:ClientGalleryFile[]
  galleryTotal:number
  galleryOffset:number
  galleryLimit:number
  editingStatus:string
  addonCatalog:ClientAddon[]
  deliverables:Array<{id:string;fileName:string;mimeType:string;fileSize:number;publishedAt:string;previewUrl:string}>
  resources:PortalResource[]
  downloadAllUrl:string
  warnings?:string[]
}

function money(value:number){return new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP',maximumFractionDigits:0}).format(value)}
function stageLabel(status:string){return status.replace(/_/g,' ').replace(/\b\w/g,(char)=>char.toUpperCase())}
function AccessMessage({title,message,onRetry}:{title:string;message:string;onRetry?:()=>void}){return <main className="flex min-h-screen items-center justify-center bg-[#171717] p-6 text-white"><div className="w-full max-w-lg border border-white/10 bg-white/[0.03] p-8 text-center"><h1 className="text-xl font-semibold">{title}</h1><p className="mt-3 text-sm leading-relaxed text-white/50">{message}</p>{onRetry?<button type="button" onClick={onRetry} className={`${portalPrimaryAction} mt-5 px-5 py-2.5 text-xs font-bold uppercase`}>Try Again</button>:null}</div></main>}

const portalPrimaryAction='rounded-lg bg-primary text-white transition-all duration-300 ease-out hover:-translate-y-0.5 hover:bg-[#0300a8] hover:shadow-[0_10px_28px_rgba(5,0,208,0.35)] active:translate-y-0 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4CEFF]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#171717] disabled:pointer-events-none disabled:translate-y-0 disabled:shadow-none'
export default function ClientPortalPage(){
  const params=useParams<{id:string}>();const searchParams=useSearchParams();const publicId=decodeURIComponent(params.id||'');const signature=searchParams.get('sig')||''
  const [data,setData]=useState<PortalData|null>(null);const [loading,setLoading]=useState(true);const [loadingMore,setLoadingMore]=useState(false);const [error,setError]=useState('')
  const load=async(offset=0)=>{
    if(offset===0){setLoading(true);setError('')}else setLoadingMore(true)
    try{
      const credentialQuery=signature&&!data?`&sig=${encodeURIComponent(signature)}`:''
      const response=await fetch(`/api/editor-workflow/portal/${encodeURIComponent(publicId)}?offset=${offset}&limit=48${credentialQuery}`,{cache:'no-store',credentials:'include'})
      const body=(await response.json().catch(()=>({}))) as PortalData&{error?:string}
      if(!response.ok){const reason=body.error||'This client portal is unavailable.';throw new Error(`${reason} Try: refresh this page. If it continues, ask FICO MANA staff to reopen or regenerate your private portal link.`)}
      setData((previous)=>offset===0?body:{...body,gallery:[...(previous?.gallery||[]),...body.gallery]})
      if(signature&&!data)window.history.replaceState(null,'',`/portal/${encodeURIComponent(publicId)}`)
    }catch(loadError){const message=loadError instanceof Error?loadError.message:'This client portal is unavailable.';setError(message.includes('Try:')?message:`${message} Try: refresh this page. If it continues, ask FICO MANA staff to reopen or regenerate your private portal link.`)}
    finally{setLoading(false);setLoadingMore(false)}
  }
  useEffect(()=>{if(publicId)void load();else setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[publicId,signature])

  const balance=data?Math.max(0,data.booking.price-data.booking.amountPaid):0

  if(loading)return <main className="flex min-h-screen items-center justify-center bg-[#171717] text-sm text-white/40">Preparing your Portal, No files were harmed in the process.</main>
  if(error&&!data)return <AccessMessage title="Portal unavailable" message={error} onRetry={()=>void load(0)}/>
  if(!data)return <AccessMessage title="Portal unavailable" message="This project could not be loaded. Try: refresh this page or ask FICO MANA staff to reopen your private portal link." onRetry={()=>void load(0)}/>

  return <main className="min-h-screen bg-[#171717] text-white"><div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
    <header className="border-b border-white/10 pb-6"><p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#C4CEFF]">FICO MANA Client Portal</p><div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-2xl font-semibold sm:text-3xl">{data.booking.customerName}</h1><p className="mt-1 font-mono text-[10px] text-white/35">{data.booking.id}</p></div><div className="border border-white/10 bg-white/[0.03] px-4 py-3"><p className="text-[9px] uppercase tracking-wider text-white/35">Project Status</p><p className="mt-1 text-sm font-semibold text-[#C4CEFF]">{stageLabel(data.editingStatus)}</p></div></div></header>
    {error?<div className="mt-5 border border-red-500/20 bg-red-500/[0.06] px-4 py-3 text-xs text-red-200" role="alert">{error}</div>:null}
    {data.warnings?.length?<div className="mt-5 border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 text-xs leading-relaxed text-amber-100" role="status"><strong>Some project details are temporarily unavailable:</strong> {data.warnings.join(', ')}. Try: refresh this page once; your booking and any available photos can still be viewed.</div>:null}
    <div className="mt-6 grid gap-5 lg:grid-cols-3"><section className="space-y-5 lg:col-span-2">
      <div className="grid gap-4 sm:grid-cols-2"><InfoCard icon={CalendarDays} label="Your Session"><p className="font-semibold">{data.booking.bookingDate}</p><p className="mt-1 text-xs text-white/45">{data.booking.bookingTime}</p></InfoCard><InfoCard icon={Package} label="Your Package"><p className="font-semibold">{data.booking.packageName}</p><p className="mt-1 text-xs text-white/45">Booking {data.booking.bookingStatus}</p></InfoCard></div>
      <ClientPhotoSelection publicId={publicId} selection={data.selection} gallery={data.gallery} galleryTotal={data.galleryTotal} loadingMore={loadingMore} addons={data.addonCatalog} onLoadMore={()=>void load(data.gallery.length)} onSubmitted={()=>load(0)}/>
      <section className="border border-white/10 bg-white/[0.02] p-5 sm:p-6"><div className="flex items-center gap-2"><CheckCircle2 className="size-4 text-[#C4CEFF]"/><h2 className="text-sm font-semibold">Final Deliverables</h2></div>{data.deliverables.length===0?<p className="mt-4 text-xs text-white/40">Your edited photos will appear here automatically after the studio completes and verifies delivery.</p>:<><div className="mt-4 flex flex-col gap-3 border border-emerald-500/20 bg-emerald-500/[0.05] p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold text-emerald-200">Your Photos Are Ready</p><p className="mt-1 text-[11px] text-white/40">{data.deliverables.length} edited photo{data.deliverables.length===1?'':'s'}</p></div><a href={data.downloadAllUrl} className={`${portalPrimaryAction} inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-[10px] font-bold uppercase`}><Download className="size-3.5"/>Download All</a></div><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">{data.deliverables.map((file)=><a key={file.id} href={file.previewUrl} target="_blank" rel="noopener noreferrer" className="group overflow-hidden border border-white/10 transition-all duration-300 ease-out hover:-translate-y-1 hover:border-[#C4CEFF]/40 hover:shadow-[0_14px_32px_rgba(0,0,0,0.38)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4CEFF]/70"><div className="aspect-[4/5] overflow-hidden bg-black/20"><img src={file.previewUrl} alt={file.fileName} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.035]"/></div><div className="flex items-center justify-between gap-2 p-2 text-[9px] text-white/45 transition-colors duration-300 group-hover:bg-white/[0.04] group-hover:text-white/75"><span className="truncate">{file.fileName}</span><ExternalLink className="size-3 shrink-0 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"/></div></a>)}</div></>}</section>
      {data.resources.length>0?<section className="border border-white/10 bg-white/[0.02] p-5 sm:p-6"><div className="flex items-center gap-2"><FileText className="size-4 text-[#C4CEFF]"/><h2 className="text-sm font-semibold">Project Files & Updates</h2></div><div className="mt-4 divide-y divide-white/[0.07] border border-white/[0.07]">{data.resources.map((resource)=><div key={resource.id} className="p-4"><p className="text-[9px] font-bold uppercase tracking-wider text-white/35">{resource.resource_type.replace(/_/g,' ')}</p><p className="mt-1 text-sm font-semibold">{resource.title}</p>{resource.content?<p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-white/45">{resource.content}</p>:null}{resource.url?<a href={resource.url} target="_blank" rel="noopener noreferrer" className="group mt-3 inline-flex items-center gap-1.5 rounded-md border border-transparent px-2 py-1.5 text-[10px] font-bold uppercase text-[#C4CEFF] transition-all duration-300 hover:translate-x-0.5 hover:border-[#C4CEFF]/20 hover:bg-[#C4CEFF]/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4CEFF]/60">Open Resource <ExternalLink className="size-3 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"/></a>:null}</div>)}</div></section>:null}
    </section><aside className="space-y-5"><InfoCard icon={WalletCards} label="Payment Summary"><dl className="space-y-3 text-xs"><Row label="Booking Total" value={money(data.booking.price)}/><Row label="Paid" value={money(data.booking.amountPaid)} accent="text-emerald-300"/><Row label="Remaining" value={money(balance)} accent="text-[#C4CEFF]"/><Row label="Status" value={data.booking.paymentStatus}/></dl></InfoCard><PortalQrCode portalUrl={data.shareUrl} customerName={data.booking.customerName} bookingId={data.booking.id}/>{signature?<ClientPortalTrustedDevice publicId={publicId} signature={signature}/>:null}<div className="border border-[#C4CEFF]/15 bg-[#C4CEFF]/[0.04] p-5"><p className="text-[9px] font-bold uppercase tracking-wider text-[#C4CEFF]">Private Portal</p><p className="mt-2 text-[11px] leading-relaxed text-white/40">This unique link exposes only this booking&apos;s thumbnail gallery, approved project resources, and delivered files. Studio RAW originals remain protected.</p></div></aside></div>
  </div></main>
}

function InfoCard({icon:Icon,label,children}:{icon:React.ComponentType<{className?:string}>;label:string;children:React.ReactNode}){return <div className="border border-white/10 bg-white/[0.02] p-5"><div className="flex items-center gap-2 text-white/45"><Icon className="size-4"/><span className="text-[9px] font-bold uppercase tracking-wider">{label}</span></div><div className="mt-4">{children}</div></div>}
function Row({label,value,accent='text-white'}:{label:string;value:string;accent?:string}){return <div className="flex justify-between gap-4 border-b border-white/[0.06] pb-3 last:border-0 last:pb-0"><dt className="text-white/40">{label}</dt><dd className={`text-right font-semibold ${accent}`}>{value}</dd></div>}
