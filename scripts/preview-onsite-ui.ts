// Read-only visual fixture: renders the real component with synthetic records.
// It never connects to production, uploads files, or invokes staff actions.
import { createServer } from 'node:http'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import React, { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { loadTs } from '../tests/helpers/load-ts.ts'

async function main() {
const root = process.cwd()
const styles = await postcss([tailwind({ base: root })]).process(readFileSync('app/globals.css', 'utf8'), { from: resolve('app/globals.css') })
const staticRoot = existsSync('.next/static/immutable/chunks') ? '.next/static/immutable' : '.next/static'
const builtCss = readdirSync(`${staticRoot}/chunks`).filter(name=>name.endsWith('.css')).map(name=>readFileSync(resolve(`${staticRoot}/chunks`,name),'utf8')).join('\n')
const fontCss = [...builtCss.matchAll(/@font-face\{font-family:Geist[^}]*\}/g)].map(match=>match[0].replaceAll('../media/','/media/')).join('\n')
const fontFiles = new Set([...fontCss.matchAll(/\/media\/([a-zA-Z0-9._-]+\.woff2)/g)].map(match=>match[1]))
const ui = loadTs('lib/admin-ui.ts', {})
let stateIndex = 0
let showUpload = false
const onsiteReact = { ...React, useState(value: unknown) {
    const index = stateIndex++
    const schedule = { shootDate: '2026-09-08', batch: { id: 'synthetic-batch', jobs: [{
      bookingId: 'FM-EXAMPLE', customerName: 'Sample Client With a Longer Name', packageName: 'MANA PACKAGE',
      bookingTime: '1:30 PM - 3:00 PM · SLOT 1', galleryCount: 22, lastUploadAt: '2026-09-07T15:43:04Z', rawFolderDriveId: 'synthetic-folder',
      lastError: 'The original photo BNI00372.JPG is no longer available. Try: ask the studio to restore or re-upload the original to your RAW folder and click Sync Drive, then submit your selection again.',
    }] } }
    const progress = { 'FM-EXAMPLE': { uploaded: 2, total: 11, failed: [], bytesProcessed: 135 * 1024 * 1024, totalBytes: 550 * 1024 * 1024,
      activeFiles: [0,1,2].map(index => ({ index, name: `BNI0037${index}.JPG`, loaded: (index + 1) * 8 * 1024 * 1024, total: 50 * 1024 * 1024, verifying: false })), status: 'uploading', lastError: null } }
    return [index === 2 ? schedule : index === 3 ? false : index === 5 && showUpload ? progress : typeof value === 'function' ? value() : value, () => {}]
  }, useEffect() {}, useMemo: (fn:()=>unknown) => fn(), useCallback: (fn:unknown) => fn, useRef: (value:unknown)=>({current:value}) }
const onsiteStubs = {
  react: onsiteReact,
  '@/components/use-cached-page-read': {
    useCachedPageRead: () => { const [data,setData] = onsiteReact.useState(null); const [loading,setLoading] = onsiteReact.useState(true); return [data,setData,loading,setLoading,loading] },
    usePageBackgroundSync() {},
  },
  '@/components/admin-toast-provider': {useAdminToast:()=>({})}, '@/components/editor-page-skeleton': {}, '@/lib/admin-ui': ui,
  '@/lib/raw-upload-client': {}, '@/lib/raw-upload-queue': {},
  '@/lib/onsite-refresh': {}, '@/components/ui/sheet': { Sheet: () => null, SheetContent: () => null, SheetHeader: () => null, SheetTitle: () => null, SheetDescription: () => null, SheetFooter: () => null },
}
const { default: OnsiteUpload } = loadTs<{ default: React.ComponentType<{initialDate:string}> }>('components/onsite-upload.tsx', onsiteStubs)
const { default: BeforeOnsiteUpload } = loadTs<{ default: React.ComponentType<{initialDate:string}> }>('components/onsite-upload.tsx', onsiteStubs, execFileSync('git',['show','HEAD:components/onsite-upload.tsx'],{encoding:'utf8'}))
const { default: EditorQueue } = loadTs<{ default: React.ComponentType<{basePath:string}> }>('components/editor-queue.tsx', {
  '@/components/use-cached-page-read': { usePageBackgroundSync() {} },
  '@/components/workspace-refresh': { WorkspaceRefreshButton: () => createElement('button', {className:'rounded-control border border-white/10 px-3 py-2'}, 'Refresh') },
  react: { ...React, useState: (value:unknown) => [typeof value === 'function' ? value() : value, () => {}], useEffect() {}, useMemo: (fn:()=>unknown) => fn(), useCallback: (fn:unknown) => fn },
  'next/link': (props:React.AnchorHTMLAttributes<HTMLAnchorElement>) => createElement('a',props),
  '@/components/admin-toast-provider': {useAdminToast:()=>({})}, '@/components/editor-page-skeleton': {}, '@/lib/admin-ui': ui,
  '@/lib/editor-read-cache': {
    getRememberedEditorQueueUi: () => ({groupMode:'day',dateSortOrder:'asc',filter:'ALL',search:'',packageFilter:'ALL'}),
    getCachedEditorBatches: () => [{id:'FM-BATCH-2026-09-08-MAIN',shootDate:'2026-09-08',totalClients:1,totalSelectedPhotos:0,driveDayFolderUrl:'#',
      clients:[{clientName:'Sample Client',bookingId:'FM-EXAMPLE',clientId:'example',packageName:'MANA PACKAGE'}],
      counts:{waitingForSelection:1,readyForEditing:0,downloaded:0,editing:0,readyToUpload:0,uploading:0,delivered:0,failed:0}}],
  },
})
createServer((request,response)=>{
  const font = request.url?.startsWith('/media/') ? request.url.slice(7) : ''
  if(fontFiles.has(font)) { response.writeHead(200, {'Content-Type':'font/woff2'}); response.end(readFileSync(resolve(`${staticRoot}/media`,font))); return }
  if(request.url==='/styles.css') { response.writeHead(200, {'Content-Type':'text/css','Cache-Control':'no-store'}); response.end(fontCss+'\n'+styles.css); return }
  if(!['/','/before','/queue','/upload','/upload-before'].includes(request.url || '')) { response.writeHead(404); response.end(); return }
  stateIndex=0
  showUpload = request.url?.startsWith('/upload') || false
  const html=renderToStaticMarkup(request.url==='/queue' ? createElement(EditorQueue,{basePath:'/editor'}) : createElement(request.url==='/before' || request.url==='/upload-before' ? BeforeOnsiteUpload : OnsiteUpload,{initialDate:'2026-09-08'}))
  response.writeHead(200, {'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'})
  response.end(`<!doctype html><html class="dark" style="--font-geist-sans:Geist;--font-geist-mono:'Geist Mono';--font-cormorant:Georgia"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Onsite mobile spacing — synthetic preview</title><link rel="stylesheet" href="/styles.css"></head><body class="admin-console font-sans antialiased"><main class="w-full min-w-0 p-5 md:p-8">${html}</main></body></html>`)
}).listen(4282,'127.0.0.1',()=>console.log('Read-only onsite UI fixture: http://127.0.0.1:4282'))
}
void main().catch(error => { console.error(error); process.exitCode = 1 })
