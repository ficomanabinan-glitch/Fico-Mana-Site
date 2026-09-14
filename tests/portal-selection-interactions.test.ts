import assert from 'node:assert/strict'
import test, { type TestContext } from 'node:test'
import type { ComponentProps } from 'react'
import { loadTs } from './helpers/load-ts.ts'
import { componentHarness, elements, content } from './helpers/component-harness.ts'
import * as summary from '../lib/client-selection-summary.ts'
import * as drafts from '../lib/portal-selection-draft.ts'
import * as navigation from '../lib/selection-step-navigation.ts'
import type { ClientSelection, ClientAddon, ClientGalleryFile } from '../components/client-photo-selection.tsx'

const Photos = () => null, Prints = () => null, Addons = () => null, Review = () => null, Preview = () => null
const addons: ClientAddon[] = [
  { id: 'extra', name: 'Extra Edit', price: 400, pricingType: 'per_photo', maxQuantity: 200, description: '' },
  { id: 'frame', name: '8R Frame', price: 1000, pricingType: 'fixed', maxQuantity: 1, photoLimit: 1, description: '' },
]
const gallery: ClientGalleryFile[] = Array.from({ length: 7 }, (_, index) => ({ id: String(index), fileName: `PHOTO-${index}.JPG`, mimeType: 'image/jpeg', previewUrl: `/api/editor-workflow/portal/private/file/${index}?kind=gallery` }))
const selection: ClientSelection = { id: 'selection', status: 'OPEN', requiredCount: 5, includedLimit: 5, clientStatus: 'Waiting', noRevisionAcknowledged: false, selectedIds: [], selectedItems: [], printAllocations: [], addonOrders: [], totalAddonAmount: 0 }
const ready: ClientSelection = { ...selection, noRevisionAcknowledged: true,
  selectedItems: gallery.slice(0,6).map((file,i) => ({ fileId:file.id, preference:'less', extraEdit:i>=5 })),
  printAllocations: (['TOGA_PICTURE_4R','ALAMPAY_BARONG_4R','FRAME_8R','WALLET_SIZE'] as const).map(category => ({ category, fileId:'0', quantity:1, label:category })),
}
function setup(initial = selection, photos = gallery, sampleMode = false) {
  const hooks = componentHarness()
  const component = loadTs<typeof import('../components/client-photo-selection.tsx')>('components/client-photo-selection.tsx', {
    react: hooks.react, '@/components/portal-photo-preview': { PortalPhotoPreview: Preview },
    '@/components/portal-photo-contact-sheet': Photos, '@/components/portal-print-picker': Prints,
    '@/components/portal-addon-picker': Addons, '@/components/portal-review': Review,
    '@/components/portal-workspace.module.css': {},
    '@/components/admin-toast-provider': { useAdminToast: () => ({ success() {} }) },
    '@/lib/client-selection-summary':summary, '@/lib/portal-selection-draft':drafts, '@/lib/selection-step-navigation':navigation,
    '@/components/ui/sheet': { Sheet:()=>null, SheetContent:()=>null, SheetHeader:()=>null, SheetTitle:()=>null, SheetDescription:()=>null },
  })
  let pricing: summary.AddonPreview = { total:0, lines:[] }, submitted = 0
  const onPricingChange = (value:summary.AddonPreview) => { pricing=value }
  const render = () => hooks.render(() => component.ClientPhotoSelection({ publicId:'private',selection:initial,gallery:photos,galleryTotal:7,loadingMore:false,addons,
    sampleMode, onLoadMore() {}, onSubmitted:async()=>{submitted++}, onPricingChange, paymentSummary:{packageAmount:6500,amountPaid:500} }))
  let tree=render(); tree=render()
  return { render:()=>tree=render(), unmount:hooks.unmount,
    photos:()=>elements(tree,el=>el.type===Photos)[0].props as ComponentProps<typeof import('../components/portal-photo-contact-sheet.tsx').default>,
    prints:()=>elements(tree,el=>el.type===Prints)[0].props as ComponentProps<typeof import('../components/portal-print-picker.tsx').default>,
    addons:()=>elements(tree,el=>el.type===Addons)[0].props as ComponentProps<typeof import('../components/portal-addon-picker.tsx').default>,
    review:()=>elements(tree,el=>el.type===Review)[0].props as ComponentProps<typeof import('../components/portal-review.tsx').default>,
    preview:()=>elements(tree,el=>el.type===Preview)[0]?.props as ComponentProps<typeof import('../components/portal-photo-preview.tsx').PortalPhotoPreview>,
    step:(label:string)=>{elements(tree,el=>el.type==='button'&&content(el).toUpperCase().endsWith(label.toUpperCase()))[0].props.onClick();tree=render()},
    click:(label:string)=>elements(tree,el=>el.type==='button'&&content(el)===label)[0].props.onClick(),
    pin:(value?:string)=>{const input=elements(tree,el=>el.type==='input'&&el.props.type==='password')[0];if(value!==undefined)input.props.onChange({target:{value}});return input?.props.value},
    get pricing(){return pricing},get submitted(){return submitted},get tree(){return tree},
  }
}
function browser(t: TestContext) {
  const values=new Map<string,string>(), previous=Object.getOwnPropertyDescriptor(globalThis,'window')
  const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value)},removeItem:(key:string)=>{values.delete(key)}}
  Object.defineProperty(globalThis,'window',{configurable:true,value:{sessionStorage:storage,matchMedia:()=>({matches:false})}})
  t.after(()=>{if(previous)Object.defineProperty(globalThis,'window',previous);else Reflect.deleteProperty(globalThis,'window')})
  return {storage,values}
}

test('actual selection controller preserves deterministic ordering, live prices, print rules and add-on assignments', t=>{
  browser(t); const f=setup();t.after(f.unmount)
  for(let i=0;i<7;i++){f.photos().onToggle(String(i));f.render()}
  assert.equal(f.pricing.total,800)
  f.photos().onToggle('0');f.render()
  assert.deepEqual(f.photos().included,['1','2','3','4','5'])
  assert.deepEqual(f.photos().extras,['6'])
  f.step('Free Prints')
  assert.deepEqual(f.prints().files.map(file=>file.id),['1','2','3','4','5'])
  for(const category of ['TOGA_PICTURE_4R','ALAMPAY_BARONG_4R','FRAME_8R'] as const)f.prints().onPrint(category,'1')
  f.prints().onWallet(['1','2']);f.render();assert.equal(f.prints().complete,true)
  f.step('Add-ons');f.addons().onToggle(addons[1]);f.render()
  assert.equal(f.addons().complete,false)
  f.addons().onPhotos('frame',['6']);f.render();assert.equal(f.addons().complete,true)
  assert.equal(f.pricing.total,1400)
  f.step('Photos');f.photos().onToggle('6');f.render();f.step('Add-ons')
  assert.deepEqual(f.addons().assignments.frame,[],'Deselecting a photo clears its assignments')
  assert.equal(f.addons().complete,false)
})

test('PIN confirmation shows balance, clears PIN on cancel and failure, and preserves exact choices for retry', async t=>{
  browser(t);const f=setup(ready);t.after(f.unmount);f.step('Review')
  assert.equal(f.review().remaining,6400)
  const payloads:Record<string,unknown>[]=[];let succeed=false
  t.mock.method(globalThis,'fetch',async (_url:unknown,init?:RequestInit)=>{payloads.push(JSON.parse(String(init?.body)));return succeed?Response.json({ok:true}):Response.json({error:'Incorrect PIN. Try: enter the last four digits.'},{status:403})})
  f.review().onSubmit();f.render()
  assert.match(content(elements(f.tree,el=>el.props['data-testid']==='submission-balance')[0]),/₱6,400/)
  f.pin('0042');f.render();f.click('Go back');f.render()
  f.review().onSubmit();f.render();assert.equal(f.pin(),'')
  await f.click('Confirm & Submit');f.render();assert.equal(payloads.length,0)
  for(let attempt=0;attempt<2;attempt++){f.pin('0042');f.render();await f.click('Confirm & Submit');await new Promise(resolve=>setImmediate(resolve));f.render();assert.equal(f.pin(),'')}
  assert.deepEqual(payloads[0],payloads[1])
  assert.equal(f.submitted,0);assert.equal(f.pricing.total,400)
  succeed=true;f.pin('0042');f.render();await f.click('Confirm & Submit');await new Promise(resolve=>setImmediate(resolve));f.render()
  assert.equal(f.submitted,1);assert.equal(payloads[2].pin,'0042')
  assert.equal(payloads[2].total,undefined)
  assert.equal(f.review().locked,true)
})

test('session draft restores add-on photos without PIN or prices and clears after submission', async t=>{
  const b=browser(t);const f=setup(ready);f.step('Add-ons');f.addons().onToggle(addons[1]);f.render();f.addons().onPhotos('frame',['5']);f.render();f.step('Review');f.render();f.unmount()
  const key=drafts.portalDraftKey('private','selection',null,5)
  const saved=drafts.readPortalDraft(key,b.storage)!
  assert.deepEqual(saved.choices.addonPhotos?.frame,['5'])
  const restored=setup(ready);t.after(restored.unmount);assert.equal(restored.review().remaining,7400)
  assert.equal(drafts.readPortalDraft(key,b.storage)?.expiresAt,saved.expiresAt)
  t.mock.method(globalThis,'fetch',async()=>Response.json({ok:true}))
  restored.review().onSubmit();restored.render();restored.pin('0042');restored.render()
  assert.ok(![...b.values.values()].some(value=>value.includes('0042')))
  await restored.click('Confirm & Submit');await new Promise(resolve=>setImmediate(resolve));restored.render()
  assert.equal(b.values.size,0)
})

test('submitted server state replaces stale drafts, keeps price snapshots and protected unloaded photo URLs', t=>{
  const b=browser(t), key=drafts.portalDraftKey('private','selection',null,5)
  drafts.writePortalDraft(key,{included:['0'],extras:[],editingPreference:'raw',printSelections:{},walletSelections:[],addonQuantities:{},acknowledged:false,step:'photos'},b.storage)
  const f=setup({...ready,status:'SUBMITTED',totalAddonAmount:75,addonOrders:[{addonId:'frame',name:'8R Frame',quantity:1,photoCount:0,photoIds:['0'],total:75}]},[])
  t.after(f.unmount)
  assert.equal(f.pricing.total,75);assert.equal(b.values.size,0);assert.equal(f.review().locked,true)
  assert.equal(f.review().selectedPhoto('0').previewUrl,'/api/editor-workflow/portal/private/file/0?kind=gallery')
  f.step('Add-ons');assert.equal(f.addons().locked,true)
})

test('selected filter restores unloaded selections and viewer navigation stays in that set', t => {
  browser(t); const f = setup(ready, gallery.slice(0, 2)); t.after(f.unmount)
  f.photos().onFilter('selected'); f.render()
  assert.equal(f.photos().selectedFiles.length, 6)
  const missing = f.photos().selectedFiles.find(file => file.id === '5')!
  assert.equal(missing.previewUrl, '/api/editor-workflow/portal/private/file/5?kind=gallery')
  f.photos().onPreview(missing); f.render()
  assert.deepEqual(f.preview().files?.map(file => file.id), ['0','1','2','3','4','5'])
  assert.equal(f.preview().selected, true)
  f.preview().onToggleSelection?.(); f.render()
  assert.deepEqual(f.photos().extras, [])
  assert.equal(f.preview().file?.id, '4', 'Deselecting the current filtered photo moves to its neighbor')
})

test('viewer selection shows extra pricing, preserves locks, and review previews are read-only', t => {
  browser(t); const f = setup(ready); t.after(f.unmount)
  f.photos().onPreview(gallery[6]); f.render()
  assert.equal(f.preview().selectionLabel, 'Add for ₱400')
  f.preview().onToggleSelection?.(); f.render()
  assert.equal(f.preview().selected, true)
  assert.equal(f.pricing.total, 800)
  f.step('Review'); f.review().onPreview(gallery[0]); f.render()
  assert.equal(f.preview().onToggleSelection, undefined)
  f.review().onEdit('photos'); f.render(); assert.equal(f.photos().extras.length, 2)
  const locked = setup({ ...ready, status: 'SUBMITTED' }); t.after(locked.unmount)
  locked.step('Photos'); locked.photos().onPreview(gallery[6]); locked.render()
  assert.equal(locked.preview().locked, true)
  locked.preview().onToggleSelection?.(); locked.render()
  assert.deepEqual(locked.photos().extras, ['5'])
})

test('approved editing samples appear only for the standard softness preference', t => {
  browser(t)
  const standard = setup({
    ...ready,
    selectedItems: ready.selectedItems.map(item => ({ ...item, preference: 'standard' })),
  })
  t.after(standard.unmount)
  assert.match(content(standard.tree), /See the approved samples/)

  const less = setup(ready)
  t.after(less.unmount)
  assert.doesNotMatch(content(less.tree), /See the approved samples/)
})

test('sample portal finishes locally without a PIN, network submission, or duplicate header count', t => {
  browser(t)
  let requests = 0
  t.mock.method(globalThis, 'fetch', async () => { requests++; return Response.json({ ok: true }) })
  const sample = setup(ready, gallery, true)
  t.after(sample.unmount)

  assert.doesNotMatch(content(sample.tree), /Included photos/i)
  sample.step('Review')
  sample.review().onSubmit()
  sample.render()

  assert.equal(sample.review().locked, true)
  assert.equal(elements(sample.tree, element => element.type === 'input' && element.props.type === 'password').length, 0)
  assert.equal(requests, 0)
  assert.equal(sample.submitted, 0)
})

test('photo viewing tip dismisses after eight seconds or immediately from its close button', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  browser(t)

  const automatic = setup()
  assert.equal(automatic.photos().showPhotoTip, true)
  t.mock.timers.tick(7_999)
  automatic.render()
  assert.equal(automatic.photos().showPhotoTip, true)
  t.mock.timers.tick(1)
  automatic.render()
  assert.equal(automatic.photos().showPhotoTip, false)
  automatic.unmount()

  const manual = setup()
  manual.photos().onDismissPhotoTip()
  manual.render()
  assert.equal(manual.photos().showPhotoTip, false)
  manual.unmount()
})

test('expired draft keeps current choices visible and can explicitly save again', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  const b = browser(t); const f = setup(); t.after(f.unmount)
  f.photos().onToggle('0'); f.render(); f.render()
  t.mock.timers.tick(drafts.PORTAL_DRAFT_TTL_MS); f.render()
  assert.match(content(f.tree), /Your saved draft expired/)
  assert.deepEqual(f.photos().included, ['0'])
  assert.equal(b.values.size, 0)
  f.click('Save draft again'); f.render()
  assert.match(content(f.tree), /Draft saved in this tab/)
  assert.equal(b.values.size, 1)
})

test('long press opens preview once without toggling selection; tap and keyboard select; scroll and unmount cancel pending previews', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const hooks = componentHarness()
  const component = loadTs<typeof import('../components/portal-photo-preview.tsx')>('components/portal-photo-preview.tsx', { react: hooks.react, '@/lib/photo-pan-zoom': {}, '@/components/portal-preview-cache': {} })
  let selects = 0, previews = 0
  const button = hooks.render(() => component.PhotoSelectButton({ file: gallery[0], locked: false, onSelect: () => selects++, onPreview: () => previews++, children: null }))
  const pointer = { isPrimary: true, button: 0, pointerId: 1, clientX: 10, clientY: 10 }
  const click = { preventDefault() {}, stopPropagation() {} }
  button.props.onPointerDown(pointer); t.mock.timers.tick(449); button.props.onPointerUp(); button.props.onClick(click)
  assert.equal(selects, 1); assert.equal(previews, 0)
  button.props.onPointerDown(pointer); t.mock.timers.tick(450); button.props.onClick(click)
  assert.equal(selects, 1); assert.equal(previews, 1)
  button.props.onClick(click); assert.equal(selects, 2, 'Keyboard click has no pointer prerequisite')
  button.props.onPointerDown(pointer); button.props.onPointerMove({ ...pointer, clientX: 50 }); t.mock.timers.tick(500)
  assert.equal(previews, 1)
  button.props.onPointerDown(pointer); button.props.onPointerCancel(); t.mock.timers.tick(500)
  assert.equal(previews, 1)
  button.props.onPointerDown(pointer); hooks.unmount(); t.mock.timers.tick(500)
  assert.equal(previews, 1)
})
