import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './helpers/load-ts.ts'
import { componentHarness, elements, content } from './helpers/component-harness.ts'

const tick=()=>new Promise(resolve=>setImmediate(resolve))
test('completed onsite upload sends portal email; Retry resends only email and partial uploads do not send', async t => {
  const savedFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = savedFetch })
  const dataset = { batch: { jobs: [{ bookingId: 'ONE', customerName: 'Test Client', packageName: 'MANA', bookingTime: '1 PM', galleryCount: 1, storageReady: true, portalUrl: 'https://ficomana.com/portal/test?sig=private' }] } }
  let uploadCalls = 0, emailCalls = 0, emailFails = true, partial = false
  globalThis.fetch = async url => {
    if (String(url).endsWith('/portal-email')) {
      emailCalls++
      return Response.json(emailFails ? { error: 'Try: retry email.' } : { status: 'SENT' }, { status: emailFails ? 502 : 200 })
    }
    return Response.json(dataset)
  }
  const h = componentHarness()
  const react = { ...h.react, useCallback: (fn: unknown, deps: unknown[]) => h.react.useMemo(() => fn, deps) }
  const Sheet = () => null
  const ui = loadTs<typeof import('../components/onsite-upload.tsx')>('components/onsite-upload.tsx', {
    react, '@/components/use-cached-page-read': { useCachedPageRead: () => [dataset, () => {}, false, () => {}], usePageBackgroundSync: () => {} },
    '@/components/admin-toast-provider': { useAdminToast: () => ({ success() {}, warning() {}, error() {} }) },
    '@/components/editor-page-skeleton': {}, '@/lib/admin-ui': {}, '@/lib/raw-upload-client': {},
    '@/lib/raw-upload-queue': { uploadRawQueue: async (_id: string, _files: File[], onProgress: (state: unknown) => void) => {
      uploadCalls++
      const state = { uploaded: 1, total: partial ? 2 : 1, failed: partial ? [new File(['x'], 'failed.jpg')] : [], activeFiles: [], bytesProcessed: 5, totalBytes: 5, status: partial ? 'partial' : 'complete', lastError: null }
      onProgress(state)
      return state
    } },
    '@/lib/onsite-refresh': { notifyOnsitePhotosChanged() {} },
    '@/components/ui/sheet': { Sheet, SheetContent: Sheet, SheetHeader: Sheet, SheetTitle: Sheet, SheetDescription: Sheet, SheetFooter: Sheet },
  })
  const render = () => h.render(() => ui.default({ initialDate: '2026-09-08' }))
  const button = (label: string) => elements(render(), el => el.type === 'button' && content(el) === label)[0]
  const upload = async () => {
    button('Upload Photos').props.onClick()
    const picker = elements(render(), el => el.type === 'input' && el.props.type === 'file')[0]
    await picker.props.onChange({ target: { files: [new File(['image'], 'photo.jpg')] } })
    await tick(); await tick()
  }
  await upload()
  assert.equal(uploadCalls, 1); assert.equal(emailCalls, 1)
  const panel = elements(render(), el => el.type === 'aside' && el.props['aria-label'] === 'Upload activity')[0]
  assert.ok(panel)
  const portalLink = elements(render(), el => el.type === 'a' && content(el) === 'Open Client Portal')[0]
  assert.equal(portalLink.props.href, dataset.batch.jobs[0].portalUrl)
  assert.equal(portalLink.props.target, '_blank')
  assert.match(content(panel), /confirm the right photos are visible/i)
  assert.match(panel.props.className, /fixed bottom-4 left-4 right-4.*sm:left-auto sm:w-96/)
  assert.equal(elements(render(), el => el.type === 'article').some(card => elements(card, el => el.props.role === 'progressbar').length > 0), false, 'Progress is not placed inside client cards')
  const panelButton = (label: string) => elements(render(), el => el.type === 'button' && el.props['aria-label'] === label)[0]
  panelButton('Collapse uploads').props.onClick()
  assert.equal(panelButton('Expand uploads').props['aria-expanded'], false)
  panelButton('Expand uploads').props.onClick()
  panelButton('Dismiss upload activity').props.onClick()
  assert.equal(elements(render(), el => el.type === 'aside').length, 0)
  assert.match(content(render()), /Upload completed, but the email failed to send. Do you want to retry\?/)
  emailFails = false
  button('Retry').props.onClick(); await tick(); await tick()
  assert.equal(uploadCalls, 1, 'Email retry never reuploads files')
  assert.equal(emailCalls, 2)
  assert.match(content(render()), /Email Sent/)
  partial = true
  await upload()
  assert.equal(elements(render(), el => el.type === 'aside').length, 1, 'A new upload reopens the panel')
  assert.equal(uploadCalls, 2); assert.equal(emailCalls, 2, 'Partial upload waits for failed files to succeed')
  h.unmount()
})

test('actual onsite handlers keep Upload first, combine Sync, require delete confirmation, resume, refresh, and block competing actions',async t=>{
  const savedFetch=globalThis.fetch;t.after(()=>{globalThis.fetch=savedFetch})
  const calls:Array<{url:string;body?:any}>=[],messages:string[]=[]
  let synced=0,release:(value:Response)=>void=()=>{}
  const job={bookingId:'ONE',customerName:'Synthetic Client',packageName:'MANA',bookingTime:'1 PM',galleryCount:2,storageReady:true}
  const dataset={batch:{jobs:[job]},shootDate:'2026-09-08'}
  globalThis.fetch=async(url,options)=>{
    const body=options?.body?JSON.parse(String(options.body)):undefined
    calls.push({url:String(url),body})
    if(String(url).endsWith('/reset')){
      assert.equal(body.confirmBookingId,'ONE')
      if(!body.resetId)return Response.json({resetId:'00000000-0000-4000-8000-000000000003'})
      return new Promise(resolve=>{release=resolve})
    }
    return Response.json(String(url).endsWith('/index')?{indexed:2,removed:1}:dataset)
  }
  const h=componentHarness()
  const react={...h.react,useCallback:(fn:unknown,deps:unknown[])=>h.react.useMemo(()=>fn,deps)}
  const Sheet=()=>null
  const toast={success:(title:string)=>messages.push(title),warning:(title:string)=>messages.push(title),error:(title:string)=>messages.push(title)}
  const setData=()=>{},setLoading=()=>{}
  const ui=loadTs<typeof import('../components/onsite-upload.tsx')>('components/onsite-upload.tsx',{
    react,'@/components/use-cached-page-read':{useCachedPageRead:()=>[dataset,setData,false,setLoading],usePageBackgroundSync:()=>{}},
    '@/components/admin-toast-provider':{useAdminToast:()=>toast},'@/components/editor-page-skeleton':{},'@/lib/admin-ui':{},
    '@/lib/raw-upload-client':{},'@/lib/raw-upload-queue':{},'@/lib/onsite-refresh':{notifyOnsitePhotosChanged:()=>{synced++}},
    '@/components/ui/sheet':{Sheet,SheetContent:Sheet,SheetHeader:Sheet,SheetTitle:Sheet,SheetDescription:Sheet,SheetFooter:Sheet},
  })
  const render=()=>h.render(()=>ui.default({initialDate:'2026-09-08'}))
  const button=(label:string)=>elements(render(),el=>el.type==='button'&&content(el)===label)[0]
  const tree=render();await tick()
  const actions=elements(tree,el=>el.props.className==='onsite-actions')[0]
  assert.deepEqual(elements(actions,el=>el.type==='button').map(content),['Upload Photos','Refresh Gallery','Delete Files'])
  button('Refresh Gallery').props.onClick();await tick();await tick()
  assert.ok(calls.some(call=>call.url.endsWith('/index')));assert.ok(!calls.some(call=>call.url.includes('/folders/')))
  const count=calls.length
  button('Delete Files').props.onClick();assert.equal(calls.length,count,'Opening confirmation never deletes')
  button('Delete Files for This Client').props.onClick();await tick()
  assert.equal(button('Upload Photos').props.disabled,true);assert.equal(button('Refresh Gallery').props.disabled,true)
  assert.equal(calls.filter(call=>call.url.endsWith('/reset')).length,2,'Start followed by resume, both scoped to the confirmed client')
  release(Response.json({complete:true,cleared:2,total:2}));await tick();await tick()
  assert.equal(button('Upload Photos').props.disabled,false);assert.ok(messages.includes('Uploaded files cleared'));assert.equal(synced,2)
  assert.ok(calls.at(-1)?.url.includes('&fast=1'))
  h.unmount()
})

test('reset route requires onsite capability, trusted origin, rate budget and exact confirmation; it never trusts supplied workspace or actor',async()=>{
  let allowed=true,trusted=true,limited=false;const calls:any[]=[]
  const access={workspaceId:'workspace',role:'onsite'}
  class RawUploadError extends Error{}
  const route=loadTs<typeof import('../app/api/editor-workflow/[...path]/route.ts')>('app/api/editor-workflow/[...path]/route.ts',{
    'next/server':{NextResponse:{json:Response.json}},archiver:{},'@/lib/editor-workflow':{},'@/lib/portal-raw-downloads':{},'@/lib/package-workflow':{},
    '@/lib/selection-review':{SelectionReviewError:class SelectionReviewError extends Error{},reviewSelection:async()=>({success:true})},
    '@/lib/auth-api':{requireWorkflowAuth:async(_capability:unknown,request:Request)=>{assert.equal(request.method,'POST');return trusted?{user:{id:'staff'},access,error:null}:{error:Response.json({},{status:403})}}},
    '@/lib/auth/workflow':{canUseWorkflow:()=>allowed},'@/lib/storage/storage-service':{},
    '@/lib/security/api-rate-limit':{API_RATE_LIMITS:{},enforceApiRateLimit:async()=>limited?Response.json({},{status:429}):null},
    '@/lib/security/file-validation':{},'@/lib/security/schemas':{},'@/lib/security/security-audit':{},'@/lib/security/upload-scanner':{},'@/lib/security/request-security':{},
    '@/lib/raw-upload-contract':{RawUploadError},'@/lib/raw-upload-server':{},
    '@/lib/onsite-photo-reset':{beginOnsitePhotoReset:async(context:any)=>{calls.push(context);return{resetId:'00000000-0000-4000-8000-000000000003'}},continueOnsitePhotoReset:async(context:any,id:string)=>{calls.push({...context,id});return{complete:true}}},
    "@/lib/portal-download-stream": {}, '@/lib/private-download-manifest': {},
  })
  const request=(body:any)=>route.POST(new Request('https://editor.ficomana.com/api/editor-workflow/raw/ONE/reset',{method:'POST',body:JSON.stringify(body)}) as never,{params:Promise.resolve({path:['raw','ONE','reset']})})
  for(const bad of [{},{confirmBookingId:'TWO'},{confirmBookingId:'ONE',resetId:5},{confirmBookingId:'ONE',resetId:'------------------------------------'}])assert.equal((await request(bad)).status,400)
  assert.equal(calls.length,0)
  const result=await request({confirmBookingId:'ONE',workspaceId:'fake',actorId:'fake'})
  assert.equal(result.status,200);assert.match(result.headers.get('cache-control')!,/no-store/)
  assert.deepEqual(calls,[{workspaceId:'workspace',bookingId:'ONE',actorId:'staff'}])
  allowed=false;assert.equal((await request({confirmBookingId:'ONE'})).status,403)
  allowed=true;trusted=false;assert.equal((await request({confirmBookingId:'ONE'})).status,403)
  trusted=true;limited=true;assert.equal((await request({confirmBookingId:'ONE'})).status,429);assert.equal(calls.length,1)
})
