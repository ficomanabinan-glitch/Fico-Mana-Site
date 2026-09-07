import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './helpers/load-ts.ts'
import { componentHarness } from './helpers/component-harness.ts'

const tick=()=>new Promise(resolve=>setImmediate(resolve))
test('portal quietly retains healthy/offline content, blocks reset galleries and reloads a changed revision without overlapping requests',async t=>{
  const original={fetch:globalThis.fetch,window:globalThis.window,document:globalThis.document,setInterval:globalThis.setInterval,clearInterval:globalThis.clearInterval}
  t.after(()=>Object.assign(globalThis,original))
  const listeners=new Map<string,()=>void>()
  const target={addEventListener:(name:string,fn:()=>void)=>listeners.set(name,fn),removeEventListener:(name:string)=>listeners.delete(name)}
  Object.assign(globalThis,{window:target,document:{...target,visibilityState:'visible'}})
  let poll:()=>void=()=>{},reads=0,resets=0,changes=0,unavailable=false,pending=false,release:()=>void=()=>{}
  let next={generation:0,reopenedAt:null as string|null,galleryCount:2,resetting:false}
  globalThis.setInterval=((callback:()=>void,ms:number)=>{assert.equal(ms,30000);poll=callback;return 1}) as never
  globalThis.clearInterval=(()=>{}) as never
  globalThis.fetch=async()=>{reads++;if(pending)await new Promise<void>(resolve=>{release=resolve});return unavailable?Response.json({},{status:503}):Response.json(next)}
  const h=componentHarness()
  const code=loadTs<typeof import('../components/use-portal-photo-sync.ts')>('components/use-portal-photo-sync.ts',{react:h.react})
  const render=()=>h.render(()=>code.usePortalPhotoSync('private',{generation:0,reopenedAt:null,galleryCount:2},()=>{resets++},async()=>{changes++}))
  render();await tick();assert.equal(changes,0)
  unavailable=true;poll();await tick();assert.equal(changes,0);assert.equal(resets,0)
  unavailable=false;next={...next,generation:1,resetting:true};poll();await tick();assert.equal(resets,1)
  next={...next,resetting:false,galleryCount:0,reopenedAt:'changed'};poll();await tick();assert.equal(changes,1)
  pending=true;poll();const count=reads;poll();poll();assert.equal(reads,count,'Only one request at a time');release();await tick()
  h.unmount();assert.equal(listeners.size,0)
})

test('first download on another device quietly refreshes the expiry notice without resetting choices',async t=>{
  const original={fetch:globalThis.fetch,window:globalThis.window,document:globalThis.document,setInterval:globalThis.setInterval,clearInterval:globalThis.clearInterval}
  t.after(()=>Object.assign(globalThis,original))
  const listeners=new Map<string,()=>void>()
  const target={addEventListener:(name:string,fn:()=>void)=>listeners.set(name,fn),removeEventListener:(name:string)=>listeners.delete(name)}
  Object.assign(globalThis,{window:target,document:{...target,visibilityState:'visible'}})
  let poll:()=>void=()=>{},changes=0,resets=0
  let current={generation:0,reopenedAt:null,galleryCount:2,expiresAt:null as string|null,firstDownloadAt:null as string|null}
  let next={...current,resetting:false}
  globalThis.setInterval=((callback:()=>void)=>{poll=callback;return 1}) as never
  globalThis.clearInterval=(()=>{}) as never
  globalThis.fetch=async()=>Response.json(next)
  const h=componentHarness()
  const {usePortalPhotoSync}=loadTs<typeof import('../components/use-portal-photo-sync.ts')>('components/use-portal-photo-sync.ts',{react:h.react})
  const render=()=>h.render(()=>usePortalPhotoSync('private',current,()=>{resets++},async()=>{changes++;current={...next}}))
  render();await tick();assert.equal(changes,0)
  next={...next,firstDownloadAt:'2026-09-08T00:00:00Z',expiresAt:'2026-10-08T00:00:00Z'}
  poll();await tick();assert.equal(changes,1);assert.equal(resets,0)
  render();poll();await tick();assert.equal(changes,1)
  h.unmount();assert.equal(listeners.size,0)
})
