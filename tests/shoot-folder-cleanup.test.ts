import assert from 'node:assert/strict'
import test from 'node:test'
import * as React from 'react'
import { loadTs } from './helpers/load-ts.ts'
import * as files from '../lib/shoot-storage-cleanup.ts'
import * as adminUi from '../lib/admin-ui.ts'
import * as zod from 'zod'

const folders = loadTs<typeof import('../lib/shoot-folder-cleanup.ts')>('lib/shoot-folder-cleanup.ts', {
  './shoot-storage-cleanup': files, zod,
})
const workspaceId = '11111111-1111-4111-8111-111111111111'
const actorId = '22222222-2222-4222-8222-222222222222'
const bookingId = 'FM-SYNTHETIC'
const folderMime = folders.DRIVE_FOLDER_TYPE
const target = { id:'client',name:'Synthetic shoot',mimeType:folderMime,parents:['day'],modifiedTime:'unchanged',capabilities:{canTrash:true} }
const grant: import('../lib/shoot-folder-cleanup.ts').CleanupFolderGrant = {
  version:1,kind:'shoot_folder',workspaceId,actorId,bookingId,rootId:'root',shootDate:'2026-09-07',expiresAt:Date.now()+60_000,
  folder:{id:'client',name:target.name,parents:['day','month','root'],fingerprint:files.cleanupFingerprint(target)},
  treeFingerprint:folders.folderTreeFingerprint([target]),fileCount:0,subfolderCount:0,shortcutCount:0,
}

function useSigningKey(t: test.TestContext) {
  const previous=process.env.SECURITY_HASH_SECRET
  process.env.SECURITY_HASH_SECRET='synthetic-folder-cleanup-test-key-long-enough'
  t.after(()=>{if(previous===undefined)delete process.env.SECURITY_HASH_SECRET;else process.env.SECURITY_HASH_SECRET=previous})
}

test('folder review binds empty folders to actor, workspace, dates and their registered root without accepting file tokens',t=>{
  useSigningKey(t)
  const token=folders.signCleanupFolderGrant(grant)
  assert.deepEqual(folders.verifyCleanupFolderGrant(token,workspaceId,actorId),grant)
  for (const bad of [token+'x',token+'.extra']) {
    assert.throws(()=>folders.verifyCleanupFolderGrant(bad,workspaceId,actorId))
  }
})

test('folder grants reject root/day/month targets, tampering, wrong sessions, expiry and file confirmation domains',t=>{
  useSigningKey(t)
  const token=folders.signCleanupFolderGrant(grant)
  assert.throws(()=>folders.verifyCleanupFolderGrant(token,actorId,actorId))
  assert.throws(()=>folders.verifyCleanupFolderGrant(token,workspaceId,workspaceId))
  assert.throws(()=>folders.verifyCleanupFolderGrant(token,workspaceId,actorId,grant.expiresAt))
  assert.throws(()=>files.verifyCleanupGrant(token,workspaceId,actorId))
  for(const id of ['root','day','month'])assert.throws(()=>folders.signCleanupFolderGrant({...grant,folder:{...grant.folder,id}}))
  assert.throws(()=>folders.signCleanupFolderGrant({...grant,rootId:'another-root'}))
  const fileGrant={version:1,workspaceId,actorId,bookingId,rootId:'root',shootDate:'2026-09-07',expiresAt:grant.expiresAt,
    files:[{id:'photo',name:'photo.jpg',category:'RAW',parents:['raw','client','day','month','root'],fingerprint:'synthetic'}]} as const
  const fileToken=files.signCleanupGrant(fileGrant as unknown as files.CleanupGrant)
  assert.throws(()=>folders.verifyCleanupFolderGrant(fileToken,workspaceId,actorId))
})

test('folder validation rejects shortcuts, lost permissions, moved/renamed/replaced folders and detects descendant changes',()=>{
  assert.equal(folders.validateCleanupFolder(grant,target),'present')
  assert.equal(folders.validateCleanupFolder(grant,{...target,trashed:true}),'trashed')
  for(const patch of [{id:'root'},{parents:['other-day']},{parents:['day','other-day']},{mimeType:folders.DRIVE_SHORTCUT_TYPE},
    {name:'renamed'},{modifiedTime:'changed'},{capabilities:{canTrash:false}}])assert.throws(()=>folders.validateCleanupFolder(grant,{...target,...patch}))
  const photo={id:'photo',name:'photo.jpg',mimeType:'image/jpeg',parents:['client'],md5Checksum:'original'}
  const before=folders.folderTreeFingerprint([target,photo])
  assert.equal(before,folders.folderTreeFingerprint([photo,target]))
  for(const patch of [{id:'new-file'},{name:'renamed'},{parents:['other']},{md5Checksum:'replaced'}]) {
    assert.notEqual(before,folders.folderTreeFingerprint([target,{...photo,...patch}]))
  }
  assert.notEqual(before,folders.folderTreeFingerprint([target]))
})

function fixture() {
  const metadata = new Map<string, import('../lib/shoot-folder-cleanup.ts').FolderEntry>([
    ['root',{id:'root',name:'Root',mimeType:folderMime}],
    ['month',{id:'month',name:'Month',mimeType:folderMime,parents:['root']}],
    ['day',{id:'day',name:'Day',mimeType:folderMime,parents:['month']}],['client',{...target}],
  ])
  const events:string[]=[]
  const state={shared:false,uploading:false,failAudit:false,failPortal:false,failTrash:false,changeAfterAudit:false}
  const admin={from(table:string){
    let operation='select', payload:unknown
    const filters:Array<[string,unknown]>=[]
    const result=()=>{
      if(operation==='insert'){
        const action=(payload as {action:string}).action;events.push(`audit:${action}`)
        if(state.changeAfterAudit&&action==='SHOOT_FOLDER_CLEANUP_STARTED') metadata.set('new',{id:'new',name:'new.jpg',mimeType:'image/jpeg',parents:['client']})
        return {error:state.failAudit?{}:null,data:null}
      }
      if(operation==='update'){
        assert.equal(table,'client_portals');assert.deepEqual(payload && (payload as {status:string}).status,'disabled')
        assert.ok(filters.some(([key,value])=>key==='workspace_id'&&value===workspaceId))
        assert.ok(filters.some(([key,value])=>key==='booking_id'&&value===bookingId))
        events.push('disable:portal');return {error:state.failPortal?{}:null,data:null}
      }
      if(table==='google_drive_settings')return {data:{root_folder_id:'root'},error:null}
      if(table==='bookings')return {data:{id:bookingId,booking_date:'2026-09-07',customer_name:'Synthetic client'},error:null}
      if(table==='booking_provisioning')return {data:filters.some(([key])=>key==='drive_client_folder_id')?(state.shared?[{booking_id:'OTHER'}]:[]):{
        drive_root_folder_id:'root',drive_month_folder_id:'month',drive_day_folder_id:'day',drive_client_folder_id:'client'},error:null}
      if(table==='drive_folders')return {data:[],error:null}
      if(table==='editing_jobs')return {data:state.uploading?[{id:'upload'}]:[],error:null}
      throw new Error(`Unexpected table ${table}`)
    }
    const chain={select(){return chain},eq(key:string,value:unknown){filters.push([key,value]);return chain},
      in(key:string,value:unknown){filters.push([key,value]);return chain},neq(){return chain},limit(){return chain},single(){return chain},
      insert(value:unknown){operation='insert';payload=value;return chain},update(value:unknown){operation='update';payload=value;return chain},
      then(resolve:(value:unknown)=>unknown,reject:(error:unknown)=>unknown){return Promise.resolve().then(result).then(resolve,reject)},
    };return chain
  }}
  const server=loadTs<typeof import('../lib/shoot-storage-cleanup-server.ts')>('lib/shoot-storage-cleanup-server.ts',{
    '@/lib/shoot-storage-cleanup':files,'@/lib/shoot-folder-cleanup':folders,
    '@/lib/google-drive':{
      async getDriveCleanupFile(id:string){events.push(`read:${id}`);const file=metadata.get(id);if(!file)throw new Error('Not found');return {...file}},
      async listDriveCleanupChildren(id:string){events.push(`list:${id}`);return {files:[...metadata.values()].filter(file=>file.parents?.[0]===id&&!file.trashed).map(file=>({...file}))}},
      async trashDriveFile(id:string){events.push(`trash:${id}`);if(state.failTrash)throw new Error('secret-provider-error');metadata.get(id)!.trashed=true},
    },
  })
  return {metadata,events,state,
    preview:()=>server.previewCleanupShootFolder(admin as never,workspaceId,actorId,bookingId,'all'),
    execute:(value:typeof grant)=>server.executeCleanupShootFolder(admin as never,value)}
}

test('real folder preview returns a selectable signed target for an empty shoot without any writes',async t=>{
  useSigningKey(t)
  const f=fixture(),preview=await f.preview()
  assert.equal(preview.folder.fileCount,0)
  assert.equal(preview.chunks.length,1)
  assert.equal(preview.chunks[0].files.length,0)
  const signed=folders.verifyCleanupFolderGrant(preview.chunks[0].token,workspaceId,actorId)
  assert.equal(signed.folder.id,'client')
  assert.equal(f.events.some(e=>/^(trash|audit|disable):/.test(e)),false)
  const results=await f.execute(signed)
  assert.equal(results[0].status,'trashed')
  assert.deepEqual(f.events.filter(e=>/^(trash|audit|disable):/.test(e)),['audit:SHOOT_FOLDER_CLEANUP_STARTED','disable:portal','trash:client','audit:SHOOT_FOLDER_CLEANUP_FINISHED'])
  assert.equal((await f.execute(signed))[0].status,'already_trashed')
  assert.equal(f.events.filter(e=>e.startsWith('trash:')).length,1)
})

test('folder review counts nested files and shortcut objects without traversing external shortcut targets',async t=>{
  useSigningKey(t)
  const f=fixture()
  f.metadata.set('raw',{id:'raw',name:'RAW',mimeType:folderMime,parents:['client']})
  f.metadata.set('photo',{id:'photo',name:'photo.jpg',mimeType:'image/jpeg',parents:['raw']})
  f.metadata.set('document',{id:'document',name:'notes.txt',mimeType:'text/plain',parents:['client']})
  f.metadata.set('shortcut',{id:'shortcut',name:'external shortcut',mimeType:folders.DRIVE_SHORTCUT_TYPE,parents:['client']})
  const preview=await f.preview()
  assert.deepEqual([preview.folder.fileCount,preview.folder.subfolderCount,preview.folder.shortcutCount],[2,1,1])
  assert.equal(f.events.includes('list:shortcut'),false)
  await f.execute(folders.verifyCleanupFolderGrant(preview.chunks[0].token,workspaceId,actorId))
  assert.deepEqual(f.events.filter(e=>e.startsWith('trash:')),['trash:client'])
})

test('shared folders, active uploads, changed contents and audit/portal errors block folder removal',async t=>{
  useSigningKey(t)
  for(const reason of ['shared','uploading','failAudit','failPortal','changed'] as const){
    const f=fixture(),preview=await f.preview()
    const signed=folders.verifyCleanupFolderGrant(preview.chunks[0].token,workspaceId,actorId)
    if(reason==='changed')f.metadata.set('new',{id:'new',name:'new.jpg',mimeType:'image/jpeg',parents:['client']})
    else f.state[reason]=true
    await assert.rejects(()=>f.execute(signed))
    assert.equal(f.events.some(e=>e.startsWith('trash:')),false)
  }
  const f=fixture(),preview=await f.preview();f.state.changeAfterAudit=true
  const result=await f.execute(folders.verifyCleanupFolderGrant(preview.chunks[0].token,workspaceId,actorId))
  assert.equal(result[0].status,'failed')
  assert.equal(f.events.some(e=>e.startsWith('trash:')),false)
  const denied=fixture(),checked=await denied.preview();denied.state.failTrash=true
  const failed=await denied.execute(folders.verifyCleanupFolderGrant(checked.chunks[0].token,workspaceId,actorId))
  assert.equal(failed[0].status,'failed')
  assert.match(failed[0].error!,/Try:/)
  assert.doesNotMatch(JSON.stringify(failed),/secret-provider-error/)
  assert.equal(denied.metadata.get('root')?.trashed,undefined)
  assert.equal(denied.metadata.get('day')?.trashed,undefined)
})

test('storage API requires folder-specific confirmation and rejects mixed category scope without a deletion',async t=>{
  useSigningKey(t)
  const calls:string[]=[]
  const route=loadTs<{GET:(request:Request)=>Promise<Response>;POST:(request:Request)=>Promise<Response>}>('app/api/admin/shoot-storage/route.ts',{
    zod,'next/server':{NextResponse:{json:(body:unknown,init?:ResponseInit)=>Response.json(body,init)}},
    '@/lib/auth-api':{requireStaffAuth:async()=>({user:{id:actorId},error:null})},
    '@/lib/auth/workflow':{getWorkflowAccess:async()=>({workspaceId}),canUseWorkflow:()=>true},
    '@/lib/supabase/admin':{getSupabaseAdmin:()=>({})},
    '@/lib/security/api-rate-limit':{enforceApiRateLimit:async()=>null},
    '@/lib/security/request-security':{privateNoStoreHeaders:()=>({'Cache-Control':'private, no-store'})},
    '@/lib/security/outbound-url':{readBoundedResponse:async(response:Response)=>Buffer.from(await response.arrayBuffer())},
    '@/lib/shoot-storage-cleanup':files,'@/lib/shoot-folder-cleanup':folders,
    '@/lib/shoot-storage-cleanup-server':{
      executeCleanupShootFolder:async()=>{calls.push('folder');return []},
      executeCleanupShoot:async()=>{calls.push('files');return []},
      previewCleanupShootFolder:async()=>{calls.push('preview-folder');return {}},
    },
  })
  const token=folders.signCleanupFolderGrant(grant)
  const post=(confirmation:string)=>route.POST(new Request('https://example.com/api/admin/shoot-storage',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,confirmation}),
  }))
  assert.equal((await post('DELETE SHOOT FILES')).status,409)
  assert.equal((await post('DELETE SHOOT FOLDERS')).status,200)
  assert.deepEqual(calls,['folder'])
  const base='https://example.com/api/admin/shoot-storage?range=all&bookingId=FM-SYNTHETIC&scope=folder'
  assert.equal((await route.GET(new Request(base+'&categories=RAW'))).status,400)
  assert.equal((await route.GET(new Request(base))).status,200)
  assert.deepEqual(calls,['folder','preview-folder'])
})

type Element = React.ReactElement<Record<string,unknown>>
function elements(node:React.ReactNode):Element[]{
  return React.Children.toArray(node).flatMap(child=>React.isValidElement<Record<string,unknown>>(child)?[child,...elements(child.props.children as React.ReactNode)]:[])
}
test('actual cleanup UI can select zero-file folders, clears stale confirmations and never sends deletion during review',async t=>{
  const states:unknown[]=[],refs:Array<{current:unknown}>=[]
  let stateIndex=0,refIndex=0
  const component=loadTs<{default:()=>React.ReactNode}>('components/shoot-storage-cleanup.tsx',{
    react:{...React,useEffect(){},useRef(value:unknown){const index=refIndex++;return refs[index]??= {current:value}},
      useState(initial:unknown){const index=stateIndex++;if(!(index in states))states[index]=typeof initial==='function'?initial():initial
        return [states[index],(value:unknown)=>{states[index]=typeof value==='function'?value(states[index]):value}]}},
    '@/lib/admin-ui':adminUi,
  })
  const render=()=>{stateIndex=0;refIndex=0;return elements(component.default())}
  const event=(element:Element,name:string,value:unknown)=>(element.props[name] as (event:unknown)=>void)(value)
  const fetchBefore=globalThis.fetch;const methods:string[]=[]
  t.after(()=>{globalThis.fetch=fetchBefore})
  globalThis.fetch=async(input,init)=>{
    methods.push(init?.method||'GET');const url=new URL(String(input),'https://example.com')
    if(!url.searchParams.has('bookingId'))return Response.json({shoots:[{id:bookingId,name:'Synthetic client',date:'2026-09-07'}],nextCursor:null})
    return Response.json({bookingId,name:'Synthetic client',date:'2026-09-07',chunks:[{token:'synthetic-folder-token',files:[]}],skippedShortcuts:0,expiresAt:Date.now()+60_000,
      folder:{id:'client',name:'Synthetic shoot',fileCount:0,subfolderCount:4,shortcutCount:0}})
  }
  event(render().find(e=>e.props.id==='cleanup-scope')!,'onChange',{target:{value:'folder'}})
  let nodes=render()
  const review=nodes.find(e=>e.type==='button'&&e.props.children==='Review folders')!
  assert.equal(review.props.disabled,false)
  event(review,'onClick',{})
  await new Promise(resolve=>setImmediate(resolve))
  nodes=render()
  const checkboxes=nodes.filter(e=>e.type==='input'&&e.props.type==='checkbox')
  assert.equal(checkboxes[0].props.disabled,false)
  assert.equal(checkboxes[0].props.checked,true)
  event(checkboxes[0],'onChange',{target:{checked:false}})
  assert.equal(render().find(e=>e.type==='input'&&e.props.type==='checkbox')!.props.checked,false)
  event(render().find(e=>e.type==='input'&&e.props.type==='checkbox')!,'onChange',{target:{checked:true}})
  nodes=render();event(nodes.filter(e=>e.type==='input'&&e.props.type==='checkbox')[1],'onChange',{target:{checked:true}})
  event(nodes.find(e=>e.props.id==='cleanup-confirmation')!,'onChange',{target:{value:'DELETE SHOOT FOLDERS'}})
  const trash=render().filter(e=>e.type==='button').find(e=>React.Children.toArray(e.props.children as React.ReactNode).includes('shoot folders'))!
  assert.equal(trash.props.disabled,false,'zero files must not disable removal of the folder itself')
  // Never invoke the destructive action in this UI test.
  event(render().find(e=>e.type==='input'&&e.props.type==='checkbox')!,'onChange',{target:{checked:false}})
  assert.equal(states.includes('DELETE SHOOT FOLDERS'),false)
  assert.ok(methods.every(method=>method==='GET'))
})
