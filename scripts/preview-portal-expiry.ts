// Local, read-only visual fixtures using the actual components and synthetic records.
import { createServer } from 'node:http'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import React, { createElement, cloneElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { loadTs } from '../tests/helpers/load-ts.ts'
import * as summary from '../lib/client-selection-summary.ts'
import * as draft from '../lib/portal-selection-draft.ts'
import * as expiry from '../lib/portal-expiry.ts'
import * as list from '../lib/client-portal-list.ts'
import * as photoGestures from '../lib/photo-pan-zoom.ts'

async function main() {
  const styles=await postcss([tailwind({base:process.cwd()})]).process(readFileSync('app/globals.css','utf8'),{from:resolve('app/globals.css')})
  const staticRoot=existsSync('.next/static/immutable/chunks')?'.next/static/immutable':'.next/static'
  const builtCss=readdirSync(`${staticRoot}/chunks`).filter(file=>file.endsWith('.css')).map(file=>readFileSync(`${staticRoot}/chunks/${file}`,'utf8')).join('\n')
  const fontCss=[...builtCss.matchAll(/@font-face\{font-family:Geist[^}]*\}/g)].map(match=>match[0].replaceAll('../media/','/media/')).join('\n')
  const fontFiles=new Set([...fontCss.matchAll(/\/media\/([a-zA-Z0-9._-]+\.woff2)/g)].map(match=>match[1]))
  const sheet={Sheet:({children}:any)=>children,SheetTrigger:({render,children}:any)=>cloneElement(render,{},children),SheetContent:()=>null,SheetHeader:()=>null,SheetTitle:()=>null,SheetDescription:()=>null}
  const {default:Notice}=loadTs<any>('components/portal-expiry-notice.tsx',{'@/lib/portal-expiry':expiry})
  const {default:Sidebar}=loadTs<any>('components/portal-sidebar.tsx',{'@/components/ui/sheet':sheet})
  const photoPreview=loadTs<any>('components/portal-photo-preview.tsx',{'@/lib/photo-pan-zoom':photoGestures})
  const picture='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#363636"/><text x="200" y="250" text-anchor="middle" fill="#aaa">Sample photo</text></svg>')
  const gallery=Array.from({length:5},(_,i)=>({id:`sample-${i}`,fileName:`PHOTO-${i+1}.JPG`,mimeType:'image/jpeg',previewUrl:picture}))
  const data={booking:{id:'FM-EXAMPLE',customerName:'Sample Client',packageName:'MANA PACKAGE',bookingDate:'2026-09-08',bookingTime:'1:30 PM - 3:00 PM · SLOT 1',bookingStatus:'Confirmed',paymentStatus:'Paid Deposit',price:6500,amountPaid:500},
    portalId:'example',shareUrl:'#',expiry:{days:30,portalReadyEmailSentAt:null,expiresAt:null},
    selection:{id:'sample-selection',status:'SUBMITTED',requiredCount:5,includedLimit:5,clientStatus:'Ready for Release',noRevisionAcknowledged:true,submittedAt:'2026-09-08T00:00:00Z',selectedIds:gallery.map(file=>file.id),selectedItems:gallery.map(file=>({fileId:file.id,preference:'standard',extraEdit:false})),printAllocations:[],addonOrders:[],totalAddonAmount:0},
    gallery,galleryTotal:5,galleryOffset:0,galleryLimit:48,editingStatus:'DELIVERED',addonCatalog:[],deliverables:gallery,resources:[],downloadAllUrl:'#'}
  const source=(file:string,before:boolean)=>before?execFileSync('git',['show',`HEAD:${file}`],{encoding:'utf8'}):undefined
  function portal(before:boolean,started:boolean,photos:boolean) {
    const {default:DeliverableGallery}=loadTs<any>('components/portal-deliverable-gallery.tsx',{'@/components/portal-photo-preview':photoPreview},source('components/portal-deliverable-gallery.tsx',before))
    const portalReadyEmailSentAt=new Date(Date.now()-60_000).toISOString()
    const expiresAt=new Date(Date.parse(portalReadyEmailSentAt)+30*86_400_000).toISOString()
    const {ClientPhotoSelection}=loadTs<any>('components/client-photo-selection.tsx',{
      react:{...React,useState(initial:any){return React.useState(photos&&initial==='review'?'photos':initial)}},
      '@/lib/client-selection-summary':summary,'@/lib/portal-selection-draft':draft,'@/components/ui/sheet':sheet,
      '@/components/portal-photo-preview':photoPreview,
    },source('components/client-photo-selection.tsx',before))
    let state=0
    const stateful={...React,useState(initial:any){const index=state++;return [index===0?{...data,expiry:started?{days:30,portalReadyEmailSentAt,expiresAt}:data.expiry}:index===1?false:typeof initial==='function'?initial():initial,()=>{}]}}
    const {default:Page}=loadTs<any>('app/portal/[id]/page.tsx',{
      react:stateful,'next/navigation':{useParams:()=>({id:'example'})},'@/components/portal-qr-code':()=>null,
      '@/components/portal-sidebar':Sidebar,
      '@/components/portal-expiry-notice':Notice,'@/components/use-portal-photo-sync':{usePortalPhotoSync(){}},
      '@/components/portal-deliverable-gallery':DeliverableGallery,
      '@/lib/portal-selection-draft':draft,'@/lib/client-selection-summary':summary,'@/components/client-photo-selection':{ClientPhotoSelection},
    },source('app/portal/[id]/page.tsx',before))
    return renderToStaticMarkup(createElement(Page))
  }
  function provisioning(before:boolean) {
    const ui=loadTs<any>('lib/admin-ui.ts',{})
    const overview={items:[{bookingId:'FM-EXAMPLE',customerName:'Sample Client',shootDate:'2026-09-08',packageName:'MANA PACKAGE',bookingStatus:'Confirmed',paymentStatus:'Paid Deposit',provisioningStatus:'PARTIAL_FAILURE',storageStatus:'error',lastError:null,portal:{id:'sample',status:'active',expiresAt:null}}],storage:{configured:true,provider:'R2',portalExpiryDays:30}}
    const {default:Page}=loadTs<any>('app/admin/provisioning/page.tsx',{
      '@/components/use-cached-page-read':{useCachedPageRead:()=>[overview,()=>{},false,()=>{},false]},
      '@/components/admin-toast-provider':{useAdminToast:()=>({})},'@/components/admin-page-header':()=>createElement('h1',{},'Client Portals'),
      '@/components/portal-qr-code':()=>null,'@/lib/admin-ui':ui,'@/lib/client-portal-list':list,
    },source('app/admin/provisioning/page.tsx',before))
    return renderToStaticMarkup(createElement(Page))
  }
  createServer((request,response)=>{
    const url=new URL(request.url||'/','http://localhost')
    const font=url.pathname.startsWith('/media/')?url.pathname.slice(7):''
    if(fontFiles.has(font)){response.writeHead(200,{'Content-Type':'font/woff2'});response.end(readFileSync(`${staticRoot}/media/${font}`));return}
    // Include the removed baseline utility; current Tailwind correctly purges it.
    if(url.pathname==='/styles.css'){response.writeHead(200,{'Content-Type':'text/css'});response.end(fontCss+'\n'+styles.css+'\n.align-top{vertical-align:top}');return}
    if(!['/portal','/provisioning'].includes(url.pathname)){response.writeHead(404);response.end();return}
    const admin=url.pathname==='/provisioning',before=url.searchParams.has('before')
    response.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'})
    response.end(`<!doctype html><html class="dark" style="--font-geist-sans:Geist;--font-geist-mono:'Geist Mono';--font-cormorant:Georgia"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Portal release — synthetic ${before?'before':'after'}</title><link rel="stylesheet" href="/styles.css"></head><body class="${admin?'admin-console p-5':''} font-sans antialiased">${admin?provisioning(before):portal(before,url.searchParams.has('started'),url.searchParams.has('photos'))}</body></html>`)
  }).listen(4283,'127.0.0.1',()=>console.log('Read-only preview: http://127.0.0.1:4283/portal and /provisioning; ?before for baseline; ?started for countdown'))
}
void main().catch(error=>{console.error(error);process.exitCode=1})
