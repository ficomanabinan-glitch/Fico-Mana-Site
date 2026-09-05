'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  AlertTriangle, ArrowLeft, CheckCircle2, Download, ExternalLink, FolderSync,
  FolderUp, ImagePlus, Loader2, Play, RefreshCw, RotateCcw, Upload,
} from 'lucide-react'
import { useAdminToast } from '@/components/admin-toast-provider'
import { adminBtnGhost, adminBtnPrimary, adminPanel } from '@/lib/admin-ui'

type JobStatus = 'WAITING_FOR_SELECTION' | 'READY_FOR_EDITING' | 'DOWNLOADED' | 'EDITING' | 'READY_TO_UPLOAD' | 'UPLOADING' | 'DELIVERED' | 'UPLOAD_FAILED'
type Job = { id:string; bookingId:string; clientId:string; customerName:string; customerEmail:string; packageName:string; bookingTime:string; status:JobStatus; selectedCount:number; expectedOutputCount:number; galleryCount:number; selectionStatus:'OPEN'|'SUBMITTED'|'SUBMITTING'|'COPY_FAILED'; selectionRequiredCount:number; selectionSubmittedAt?:string|null; deliverableCount:number; lastError?:string|null }
type Detail = { id:string; shootDate:string; totalClients:number; totalSelectedPhotos:number; counts:{waitingForSelection:number;readyForEditing:number;downloaded:number;editing:number;readyToUpload:number;uploading:number;delivered:number;failed:number}; driveDayFolderUrl:string; jobs:Job[]; auditLogs:Array<{id:string;actor:string;action:string;bookingId?:string|null;timestamp:string;metadata:Record<string,unknown>}> }
type ManifestClient = { booking_id:string; client_id:string; folder_name:string; customer_name:string; expected_output_count:number }
type BatchManifest = { schema_version:number; batch_id:string; shoot_date:string; clients:ManifestClient[] }
type UploadResult = { bookingId:string; customerName:string; status:string; expected:number; uploaded:number; error?:string|null }

async function createThumbnail(file: File) {
  if (!file.type.startsWith('image/')) return null
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, 480 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) return null
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.72))
  } catch { return null }
}

function basename(relativePath:string) { return relativePath.replace(/\\/g,'/').split('/').pop() || relativePath }
async function sha256(file:File) { const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer()); return Array.from(new Uint8Array(digest),(byte)=>byte.toString(16).padStart(2,'0')).join('') }
async function responseJson(response:Response) { return (await response.json().catch(()=>({}))) as Record<string,unknown> }

export default function BatchDetailPage() {
  const params=useParams<{batchId:string}>()
  const batchId=decodeURIComponent(params.batchId||'')
  const toast=useAdminToast()
  const [detail,setDetail]=useState<Detail|null>(null)
  const [loading,setLoading]=useState(true)
  const [busyJob,setBusyJob]=useState('')
  const [rawTarget,setRawTarget]=useState('')
  const [uploadMode,setUploadMode]=useState<'all'|'failed'>('all')
  const [uploading,setUploading]=useState(false)
  const [uploadProgress,setUploadProgress]=useState({clientsDone:0,clientsTotal:0,filesDone:0,filesTotal:0,current:''})
  const [results,setResults]=useState<UploadResult[]>([])
  const rawInputRef=useRef<HTMLInputElement|null>(null)
  const directoryInputRef=useRef<HTMLInputElement|null>(null)

  const load=async()=>{
    try {
      const response=await fetch(`/api/editor-workflow/batches/${encodeURIComponent(batchId)}`,{cache:'no-store',credentials:'include'})
      const body=await responseJson(response)
      if(!response.ok) throw new Error(String(body.error||'Batch not found.'))
      setDetail(body as unknown as Detail)
    } catch(error) { toast.error('Batch unavailable',error instanceof Error?error.message:'Try again.') }
    finally { setLoading(false) }
  }

  useEffect(()=>{
    void load()
    if(directoryInputRef.current){directoryInputRef.current.setAttribute('webkitdirectory','');directoryInputRef.current.setAttribute('directory','')}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[batchId])

  const stats=useMemo(()=>detail ? [
    ['Clients',detail.totalClients],['Selected Photos',detail.totalSelectedPhotos],
    ['Waiting Selection',detail.counts.waitingForSelection],['Ready for Editing',detail.counts.readyForEditing],
    ['Editing',detail.counts.editing+detail.counts.downloaded],['Ready to Upload',detail.counts.readyToUpload],
    ['Delivered',detail.counts.delivered],['Failed',detail.counts.failed],
  ] as const:[],[detail])

  const updateJob=async(bookingId:string,status:JobStatus)=>{
    setBusyJob(bookingId)
    try {
      const response=await fetch(`/api/editor-workflow/jobs/${encodeURIComponent(bookingId)}`,{method:'PATCH',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({status})})
      const body=await responseJson(response); if(!response.ok) throw new Error(String(body.error||'Could not update job.'))
      toast.success('Editing status updated',`${bookingId} → ${status.replace(/_/g,' ')}`); await load()
    } catch(error) { toast.error('Status update failed',error instanceof Error?error.message:'Try again.') }
    finally { setBusyJob('') }
  }

  const reopenSelection=async(bookingId:string)=>{
    setBusyJob(bookingId)
    try {
      const response=await fetch(`/api/editor-workflow/selections/${encodeURIComponent(bookingId)}/reopen`,{method:'POST',credentials:'include'})
      const body=await responseJson(response); if(!response.ok) throw new Error(String(body.error||'Could not reopen selection.'))
      toast.success('Selection reopened','The client can modify their chosen photos again.'); await load()
    } catch(error) { toast.error('Reopen failed',error instanceof Error?error.message:'Try again.') }
    finally { setBusyJob('') }
  }

  const chooseRawFiles=(bookingId:string)=>{setRawTarget(bookingId);rawInputRef.current?.click()}
  const uploadRawFiles=async(files:FileList|null)=>{
    if(!files?.length||!rawTarget)return
    setBusyJob(rawTarget)
    try {
      let completed=0
      for(const file of Array.from(files)){
        const thumbnail=await createThumbnail(file);const form=new FormData();form.append('file',file)
        if(thumbnail)form.append('thumbnail',thumbnail,`${file.name}.thumb.jpg`)
        const response=await fetch(`/api/editor-workflow/raw/${encodeURIComponent(rawTarget)}`,{method:'POST',credentials:'include',body:form})
        const body=await responseJson(response);if(!response.ok)throw new Error(String(body.error||`Could not upload ${file.name}.`));completed+=1
      }
      toast.success('RAW gallery indexed',`${completed} photo${completed===1?'':'s'} added to the client portal.`);await load()
    } catch(error) { toast.error('RAW upload failed',error instanceof Error?error.message:'Try again.') }
    finally { setBusyJob('');setRawTarget('');if(rawInputRef.current)rawInputRef.current.value='' }
  }

  const indexRaw=async(bookingId:string)=>{
    setBusyJob(bookingId)
    try {
      const response=await fetch(`/api/editor-workflow/raw/${encodeURIComponent(bookingId)}/index`,{method:'POST',credentials:'include'})
      const body=await responseJson(response);if(!response.ok)throw new Error(String(body.error||'Could not index the RAW folder.'))
      toast.success('RAW folder synchronized',`${Number(body.indexed||0)} Drive photos indexed.`);await load()
    } catch(error) { toast.error('RAW sync failed',error instanceof Error?error.message:'Try again.') }
    finally { setBusyJob('') }
  }

  const downloadBatch=()=>{
    const anchor=document.createElement('a');anchor.href=`/api/editor-workflow/batches/${encodeURIComponent(batchId)}/download`;anchor.download=`${batchId}.zip`
    document.body.appendChild(anchor);anchor.click();anchor.remove();toast.success('Day batch started','Only READY FOR EDITING jobs are streamed into the ZIP.')
    window.setTimeout(()=>void load(),2500)
  }
  const chooseUploadFolder=(mode:'all'|'failed')=>{setUploadMode(mode);directoryInputRef.current?.click()}

  const uploadDirectory=async(fileList:FileList|null)=>{
    if(!fileList?.length||!detail)return
    const files=Array.from(fileList)
    const manifestFile=files.find((file)=>basename(file.webkitRelativePath||file.name)==='manifest.json')
    if(!manifestFile){toast.error('manifest.json missing','Select the complete extracted day-batch folder generated by Fico Mana.');return}
    let manifest:BatchManifest
    try{manifest=JSON.parse(await manifestFile.text()) as BatchManifest}catch{toast.error('Invalid manifest','The batch manifest could not be read.');return}
    if(manifest.batch_id!==batchId||!Array.isArray(manifest.clients)){toast.error('Wrong batch folder',`Expected ${batchId}.`);return}

    let failedIds=new Set<string>()
    if(uploadMode==='failed'){
      const response=await fetch(`/api/editor-workflow/batches/${encodeURIComponent(batchId)}/failed`,{cache:'no-store',credentials:'include'})
      const body=await responseJson(response);failedIds=new Set(Array.isArray(body.bookingIds)?body.bookingIds.map(String):[])
      if(!failedIds.size){toast.success('No failed uploads','Every client in this batch is clear.');return}
    }
    const clients=manifest.clients.filter((client)=>uploadMode==='failed'?failedIds.has(String(client.booking_id)):true)
    const work=clients.map((client)=>{
      const marker=`/${client.folder_name}/EDITED/`
      const edited=files.map((file)=>{
        const normalized=`/${(file.webkitRelativePath||file.name).replace(/\\/g,'/')}`;const markerAt=normalized.indexOf(marker)
        return markerAt<0||file.name==='.fico-client.json'?null:{file,relativePath:`EDITED/${normalized.slice(markerAt+marker.length)}`}
      }).filter((value):value is {file:File;relativePath:string}=>Boolean(value))
      return{client,edited}
    })
    const filesTotal=work.reduce((sum,item)=>sum+item.edited.length,0)
    if(!work.length){toast.warning('No matching clients','The selected folder has no clients for this upload mode.');return}
    setUploading(true);setResults([]);setUploadProgress({clientsDone:0,clientsTotal:work.length,filesDone:0,filesTotal,current:''})
    const nextResults:UploadResult[]=[];let filesDone=0

    try{
      const startResponse=await fetch(`/api/editor-workflow/batches/${encodeURIComponent(batchId)}/start-upload`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({bookingIds:work.map((item)=>item.client.booking_id)})})
      const startBody=await responseJson(startResponse);if(!startResponse.ok)throw new Error(String(startBody.error||'Could not start batch upload.'))
      const uploadJobId=String(startBody.uploadJobId)

      for(let clientIndex=0;clientIndex<work.length;clientIndex+=1){
        const item=work[clientIndex];const bookingId=String(item.client.booking_id);const customerName=String(item.client.customer_name||bookingId)
        setUploadProgress((previous)=>({...previous,current:customerName}));let clientError=''
        for(const upload of item.edited){
          let uploadFileId=''
          try{
            const checksum=await sha256(upload.file)
            const sessionResponse=await fetch(`/api/editor-workflow/batches/${encodeURIComponent(batchId)}/upload-session`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({uploadJobId,bookingId,relativePath:upload.relativePath,fileName:upload.file.name,mimeType:upload.file.type||'application/octet-stream',fileSize:upload.file.size,checksum})})
            const session=await responseJson(sessionResponse);if(!sessionResponse.ok)throw new Error(String(session.error||'Could not start file upload.'));uploadFileId=String(session.uploadFileId)
            if(!session.duplicate){
              const driveResponse=await fetch(String(session.uploadUrl),{method:'PUT',headers:{'Content-Type':upload.file.type||'application/octet-stream'},body:upload.file})
              const driveFile=await responseJson(driveResponse)
              if(!driveResponse.ok||!driveFile.id)throw new Error(String((driveFile.error as {message?:string}|undefined)?.message||'Google Drive upload failed.'))
              const completeResponse=await fetch(`/api/editor-workflow/batches/${encodeURIComponent(batchId)}/complete-file`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({uploadJobId,uploadFileId,driveFileId:driveFile.id,mimeType:upload.file.type||'application/octet-stream'})})
              const completeBody=await responseJson(completeResponse);if(!completeResponse.ok)throw new Error(String(completeBody.error||'Could not register uploaded file.'))
            }
          }catch(error){
            clientError=error instanceof Error?error.message:'File upload failed.'
            if(uploadFileId)await fetch(`/api/editor-workflow/batches/${encodeURIComponent(batchId)}/fail-file`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({uploadJobId,uploadFileId,error:clientError})}).catch(()=>undefined)
          }finally{filesDone+=1;setUploadProgress((previous)=>({...previous,filesDone}))}
        }
        try{
          const finalizeResponse=await fetch(`/api/editor-workflow/batches/${encodeURIComponent(batchId)}/finalize-client`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({uploadJobId,bookingId})})
          const finalized=await responseJson(finalizeResponse);if(!finalizeResponse.ok)throw new Error(String(finalized.error||'Client validation failed.'))
          nextResults.push(finalized as unknown as UploadResult)
        }catch(error){nextResults.push({bookingId,customerName,status:'UPLOAD_FAILED',expected:Number(item.client.expected_output_count||0),uploaded:0,error:clientError||(error instanceof Error?error.message:'Upload failed.')})}
        setResults([...nextResults]);setUploadProgress((previous)=>({...previous,clientsDone:clientIndex+1}))
      }
      const finalizeResponse=await fetch(`/api/editor-workflow/batches/${encodeURIComponent(batchId)}/finalize-upload`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({uploadJobId})})
      const summary=await responseJson(finalizeResponse);if(!finalizeResponse.ok)throw new Error(String(summary.error||'Could not finalize the batch upload.'))
      if(Number(summary.failedClients)>0)toast.warning('Batch partially completed',`${Number(summary.completedClients)} delivered · ${Number(summary.failedClients)} failed. Use Retry Failed Only.`)
      else toast.success('Batch upload complete',`${Number(summary.completedClients)} clients delivered · ${Number(summary.photosUploaded)} photos published.`)
    }catch(error){toast.error('Batch upload failed',error instanceof Error?error.message:'Try again.')}
    finally{setUploading(false);setUploadProgress((previous)=>({...previous,current:''}));if(directoryInputRef.current)directoryInputRef.current.value='';await load()}
  }

  if(loading)return <div className={`${adminPanel} p-14 text-center text-sm text-white/35`}>Loading batch…</div>
  if(!detail)return <div className={`${adminPanel} p-14 text-center text-sm text-white/35`}>Batch not found.</div>

  return <div className="space-y-6">
    <input ref={rawInputRef} type="file" multiple accept="image/*" className="hidden" onChange={(event)=>void uploadRawFiles(event.target.files)}/>
    <input ref={directoryInputRef} type="file" multiple className="hidden" onChange={(event)=>void uploadDirectory(event.target.files)}/>
    <div className="flex flex-col gap-4 border-b border-white/[0.08] pb-5 xl:flex-row xl:items-end xl:justify-between"><div><Link href="/admin/filtering?tab=editor" className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase text-white/40 hover:text-white"><ArrowLeft className="size-3.5"/>Back to Editor</Link><p className="mt-4 text-[9px] font-bold uppercase tracking-[0.2em] text-[#C4CEFF]">Editing Batch</p><h1 className="mt-1 text-2xl font-semibold">{detail.shootDate}</h1><p className="mt-1 font-mono text-[10px] text-white/35">{detail.id}</p></div><div className="flex flex-wrap gap-2"><button onClick={downloadBatch} className={`${adminBtnPrimary} inline-flex items-center gap-1.5 px-3 py-2`}><Download className="size-3.5"/>Download Ready Jobs</button>{detail.driveDayFolderUrl?<a href={detail.driveDayFolderUrl} target="_blank" rel="noopener noreferrer" className={`${adminBtnGhost} inline-flex items-center gap-1.5 px-3 py-2`}>Open Google Drive <ExternalLink className="size-3.5"/></a>:<Link href="/admin/provisioning" className={`${adminBtnGhost} inline-flex items-center gap-1.5 px-3 py-2`}>Connect Google Drive</Link>}<button onClick={()=>chooseUploadFolder('all')} disabled={uploading} className={`${adminBtnPrimary} inline-flex items-center gap-1.5 px-3 py-2`}><FolderUp className="size-3.5"/>Upload Completed Jobs</button>{detail.counts.failed>0?<button onClick={()=>chooseUploadFolder('failed')} disabled={uploading} className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-[10px] font-bold uppercase text-red-300"><RefreshCw className="size-3.5"/>Retry Failed Only</button>:null}</div></div>
    <div className="grid grid-cols-2 gap-px overflow-hidden border border-white/[0.08] bg-white/[0.06] sm:grid-cols-4 xl:grid-cols-8">{stats.map(([label,value])=><div key={label} className="bg-[#222222] p-4"><p className="text-[8px] font-bold uppercase tracking-wider text-white/25">{label}</p><p className={`mt-1 text-xl font-bold ${label==='Failed'&&value>0?'text-red-300':''}`}>{value}</p></div>)}</div>
    {uploading||results.length>0?<section className={`${adminPanel} p-5`}><div className="flex items-start justify-between gap-4"><div><p className="text-[9px] font-bold uppercase tracking-wider text-white/35">Batch Upload Progress</p><h2 className="mt-1 text-sm font-semibold">{uploading?`Uploading ${detail.shootDate}`:'Latest upload summary'}</h2></div>{uploading?<Loader2 className="size-5 animate-spin text-[#C4CEFF]"/>:<CheckCircle2 className="size-5 text-emerald-300"/>}</div><div className="mt-4 grid gap-3 sm:grid-cols-3"><ProgressStat label="Clients" value={`${uploadProgress.clientsDone} / ${uploadProgress.clientsTotal}`}/><ProgressStat label="Files" value={`${uploadProgress.filesDone} / ${uploadProgress.filesTotal}`}/><ProgressStat label="Current" value={uploadProgress.current||'Complete'}/></div>{results.length>0?<div className="mt-5 divide-y divide-white/[0.06] border border-white/[0.07]">{results.map((result)=><div key={result.bookingId} className="flex flex-wrap items-center justify-between gap-3 p-3 text-xs"><div><p className="font-semibold">{result.customerName}</p><p className="mt-1 font-mono text-[9px] text-white/30">{result.bookingId}</p></div><div className="text-right"><p className={result.status==='DELIVERED'?'text-emerald-300':'text-red-300'}>{result.status==='DELIVERED'?'✓ Delivered':'⚠ Failed'}</p><p className="mt-1 text-[10px] text-white/35">Expected {result.expected} · Uploaded {result.uploaded}</p>{result.error?<p className="mt-1 max-w-md text-[10px] text-red-300/60">{result.error}</p>:null}</div></div>)}</div>:null}</section>:null}
    <section className={`${adminPanel} overflow-hidden`}><div className="border-b border-white/[0.08] p-4"><p className="text-[9px] font-bold uppercase tracking-wider text-white/35">Batch Clients</p><h2 className="mt-1 text-sm font-semibold">Selection → Editing → Delivery</h2></div><div className="divide-y divide-white/[0.06]">{detail.jobs.map((job)=><div key={job.bookingId} className="p-4"><div className="grid gap-4 xl:grid-cols-[1fr_auto] xl:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{job.customerName}</p><StatusBadge status={job.status}/></div><p className="mt-1 text-[11px] text-white/40">{job.bookingTime} · {job.packageName} · {job.bookingId}</p><div className="mt-3 flex flex-wrap gap-3 text-[10px] text-white/35"><span>RAW indexed: <strong className="text-white/60">{job.galleryCount}</strong></span><span>Selection: <strong className="text-white/60">{job.selectedCount} / {job.selectionRequiredCount}</strong></span><span>Outputs: <strong className="text-white/60">{job.deliverableCount} / {job.expectedOutputCount}</strong></span></div>{job.lastError?<p className="mt-2 inline-flex items-center gap-1.5 text-[10px] text-red-300"><AlertTriangle className="size-3"/>{job.lastError}</p>:null}</div><div className="flex flex-wrap gap-2"><button onClick={()=>chooseRawFiles(job.bookingId)} disabled={busyJob===job.bookingId} className={`${adminBtnGhost} inline-flex items-center gap-1.5 px-3 py-2`}><ImagePlus className="size-3.5"/>Upload RAW</button><button onClick={()=>void indexRaw(job.bookingId)} disabled={busyJob===job.bookingId} className={`${adminBtnGhost} inline-flex items-center gap-1.5 px-3 py-2`}><FolderSync className="size-3.5"/>Sync RAW Folder</button>{job.selectionStatus==='SUBMITTED'&&job.status!=='DELIVERED'?<button onClick={()=>void reopenSelection(job.bookingId)} disabled={busyJob===job.bookingId} className={`${adminBtnGhost} inline-flex items-center gap-1.5 px-3 py-2`}><RotateCcw className="size-3.5"/>Reopen Selection</button>:null}{['READY_FOR_EDITING','DOWNLOADED'].includes(job.status)?<button onClick={()=>void updateJob(job.bookingId,'EDITING')} disabled={busyJob===job.bookingId} className={`${adminBtnPrimary} inline-flex items-center gap-1.5 px-3 py-2`}><Play className="size-3.5"/>Start Editing</button>:null}{['DOWNLOADED','EDITING','UPLOAD_FAILED'].includes(job.status)?<button onClick={()=>void updateJob(job.bookingId,'READY_TO_UPLOAD')} disabled={busyJob===job.bookingId} className={`${adminBtnGhost} inline-flex items-center gap-1.5 px-3 py-2`}><Upload className="size-3.5"/>Ready to Upload</button>:null}</div></div></div>)}</div></section>
    <section className={`${adminPanel} p-5`}><p className="text-[9px] font-bold uppercase tracking-wider text-white/35">Audit Log</p><h2 className="mt-1 text-sm font-semibold">Recent workflow activity</h2><div className="mt-4 divide-y divide-white/[0.06] border border-white/[0.07]">{detail.auditLogs.length===0?<p className="p-5 text-xs text-white/35">No batch activity recorded yet.</p>:detail.auditLogs.slice(0,30).map((log)=><div key={log.id} className="grid gap-2 p-3 text-[10px] sm:grid-cols-[150px_1fr_auto]"><span className="font-mono text-white/30">{new Date(log.timestamp).toLocaleString('en-PH')}</span><span className="font-semibold text-white/65">{log.action.replace(/_/g,' ')}</span><span className="font-mono text-white/25">{log.bookingId||detail.id}</span></div>)}</div></section>
  </div>
}

function ProgressStat({label,value}:{label:string;value:string}) { return <div className="border border-white/[0.07] bg-black/10 p-3"><p className="text-[8px] font-bold uppercase tracking-wider text-white/25">{label}</p><p className="mt-1 truncate text-sm font-semibold">{value}</p></div> }
function StatusBadge({status}:{status:JobStatus}) { const tone=status==='DELIVERED'?'border-emerald-500/25 bg-emerald-500/10 text-emerald-300':status==='UPLOAD_FAILED'?'border-red-500/25 bg-red-500/10 text-red-300':status==='READY_FOR_EDITING'?'border-cyan-500/25 bg-cyan-500/10 text-cyan-300':status==='READY_TO_UPLOAD'?'border-violet-500/25 bg-violet-500/10 text-violet-300':status==='EDITING'||status==='DOWNLOADED'?'border-amber-500/25 bg-amber-500/10 text-amber-300':'border-white/15 bg-white/5 text-white/50';return <span className={`rounded border px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider ${tone}`}>{status.replace(/_/g,' ')}</span> }
