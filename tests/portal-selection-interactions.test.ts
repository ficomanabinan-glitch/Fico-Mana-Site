import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './helpers/load-ts.ts'
import { componentHarness, elements, content } from './helpers/component-harness.ts'
import * as summary from '../lib/client-selection-summary.ts'
import type { ClientSelection, ClientAddon, ClientGalleryFile } from '../components/client-photo-selection.tsx'

const addons: ClientAddon[] = [
  { id: 'extra', name: 'Extra Edit', price: 400, pricingType: 'per_photo', maxQuantity: 200, description: '' },
  { id: 'print', name: 'Extra print', price: 100, pricingType: 'per_piece', maxQuantity: 10, description: '' },
  { id: 'bundle', name: 'Bundle', price: 250, pricingType: 'fixed', maxQuantity: 1, description: '' },
]
const gallery: ClientGalleryFile[] = Array.from({ length: 7 }, (_, index) => ({ id: String(index), fileName: `PHOTO-${index}.JPG`, mimeType: 'image/jpeg', previewUrl: `/api/editor-workflow/portal/private/file/${index}?kind=gallery` }))
const selection: ClientSelection = { id: 'selection', status: 'OPEN', requiredCount: 5, includedLimit: 5, clientStatus: 'Waiting', noRevisionAcknowledged: false, selectedIds: [], selectedItems: [], printAllocations: [], addonOrders: [], totalAddonAmount: 0 }

test('pricing uses configured fees, removes deselected charges, and adds draft charges only once', () => {
  for (const [extraCount, expected] of [[0, 0], [1, 400], [2, 800], [1, 400], [0, 0]]) {
    assert.equal(summary.calculateClientAddons(addons, {}, extraCount).total, expected)
  }
  assert.equal(summary.calculateClientAddons(addons, { print: 3, bundle: 1 }, 1).total, 950)
  assert.equal(summary.calculateClientAddons([{ ...addons[0], price: 450 }], {}, 1).total, 450)
  assert.deepEqual(summary.portalPaymentSummary(1200, 1200, 950), { total: 2150, paid: 1200, remaining: 950 })
  assert.equal(summary.portalPaymentSummary(1200, 3000, 950).remaining, 0)
  assert.equal(summary.initialEditingPreference([]), 'standard')
  assert.equal(summary.initialEditingPreference([{ preference: 'less' }, { preference: 'less' }]), 'less')
  assert.equal(summary.initialEditingPreference([{ preference: 'less' }, { preference: 'raw' }]), '')
})

function setup(initial = selection, photos = gallery) {
  const hooks = componentHarness()
  const preview = { PhotoSelectButton: () => null, PortalPhotoPreview: () => null }
  const component = loadTs<typeof import('../components/client-photo-selection.tsx')>('components/client-photo-selection.tsx', {
    react: hooks.react, '@/components/portal-photo-preview': preview, '@/lib/client-selection-summary': summary,
  })
  let pricing: summary.AddonPreview = { total: 0, lines: [] }
  let submitted = 0
  const onPricingChange = (value: summary.AddonPreview) => { pricing = value }
  const render = () => hooks.render(() => component.ClientPhotoSelection({
    publicId: 'private', selection: initial, gallery: photos, galleryTotal: 7, loadingMore: false, addons,
    onLoadMore: () => {}, onSubmitted: async () => { submitted++ }, onPricingChange,
  }))
  return { render, preview, get pricing() { return pricing }, get submitted() { return submitted } }
}

test('actual selection handlers update totals immediately, use one global preference, preview print choices, and submit the existing API shape', async t => {
  const f = setup()
  let tree = f.render()
  const choosePhoto = (index: number) => {
    elements(tree, el => el.type === f.preview.PhotoSelectButton)[index].props.onSelect()
    tree = f.render()
  }
  const step = (label: string) => {
    const button = elements(tree, el => el.type === 'button' && content(el).endsWith(label))[0]
    assert.ok(button); button.props.onClick(); tree = f.render()
  }
  for (let index = 0; index < 6; index++) choosePhoto(index)
  assert.equal(f.pricing.total, 400)
  choosePhoto(6); assert.equal(f.pricing.total, 800)
  choosePhoto(6); assert.equal(f.pricing.total, 400)
  const preferences = elements(tree, el => el.type === 'select')
  assert.equal(preferences.length, 1)
  preferences[0].props.onChange({ target: { value: 'less' } }); tree = f.render()
  step('Free Prints')
  const printSelects = elements(tree, el => el.type === 'select' && el.props.id?.startsWith('print-'))
  assert.equal(printSelects.length, 4)
  printSelects.forEach((select, index) => select.props.onChange({ target: { value: String(index) } }))
  tree = f.render()
  const thumbs = elements(tree, el => el.type === 'img')
  assert.equal(thumbs.length, 4)
  assert.deepEqual(thumbs.map(el => el.props.src), gallery.slice(0, 4).map(file => file.previewUrl))
  assert.ok(thumbs.every(el => el.props.className.includes('object-contain')))
  const previewButton = elements(tree, el => el.type === 'button' && el.props['aria-label']?.startsWith('Preview TOGA'))[0]
  previewButton.props.onClick(); tree = f.render()
  assert.equal(elements(tree, el => el.type === f.preview.PortalPhotoPreview)[0].props.file.id, '0')
  elements(tree, el => el.type === f.preview.PortalPhotoPreview)[0].props.onClose(); tree = f.render()
  step('Add-ons')
  const addonButtons = elements(tree, el => el.type === 'button' && el.props['aria-pressed'] !== undefined)
  addonButtons[0].props.onClick(); tree = f.render(); assert.equal(f.pricing.total, 500)
  elements(tree, el => el.type === 'input' && el.props.type === 'number')[0].props.onChange({ target: { value: '3' } })
  tree = f.render(); assert.equal(f.pricing.total, 700)
  step('Review')
  elements(tree, el => el.type === 'input' && el.props.type === 'checkbox')[0].props.onChange({ target: { checked: true } })
  tree = f.render()
  let payload: any
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    assert.equal(url, '/api/editor-workflow/portal/private/selection')
    payload = JSON.parse(String(init.body)); return Response.json({ ok: true })
  })
  const submit = elements(tree, el => el.type === 'button' && content(el) === 'Submit Final Selection')[0]
  assert.equal(submit.props.disabled, false)
  await submit.props.onClick()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(f.submitted, 1)
  assert.equal(payload.preferences.length, 6)
  assert.ok(payload.preferences.every((item: any) => item.preference === 'less'))
  assert.equal(payload.printAllocations.length, 4)
  assert.equal(payload.addons.find((item: any) => item.addonId === 'extra').quantity, 1)
  assert.equal(payload.total, undefined, 'The server, not an untrusted client total, remains authoritative')
})

test('submitted prices remain snapshots; locked quantities cannot be edited and unloaded print photos can still preview', () => {
  const saved = { ...selection, status: 'SUBMITTED' as const, selectedItems: gallery.slice(0, 5).map(file => ({ fileId: file.id, preference: 'raw' as const, extraEdit: false })),
    totalAddonAmount: 75, addonOrders: [{ addonId: 'print', name: 'Extra print', quantity: 1, photoCount: 0, total: 75 }],
    printAllocations: [{ category: 'TOGA_PICTURE_4R' as const, fileId: '0', quantity: 1, label: 'Toga' }] }
  const f = setup(saved, [])
  let tree = f.render()
  assert.equal(f.pricing.total, 75, 'Changing catalog prices does not reprice a submitted selection')
  elements(tree, el => el.type === 'button' && content(el).endsWith('Add-ons'))[0].props.onClick()
  tree = f.render()
  assert.equal(elements(tree, el => el.type === 'input' && el.props.type === 'number')[0].props.disabled, true)
  elements(tree, el => el.type === 'button' && content(el).endsWith('Free Prints'))[0].props.onClick()
  tree = f.render()
  assert.equal(elements(tree, el => el.type === 'img')[0].props.src, gallery[0].previewUrl)
})

test('long press opens preview once without toggling selection; tap and keyboard select; scroll and unmount cancel pending previews', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const hooks = componentHarness()
  const component = loadTs<typeof import('../components/portal-photo-preview.tsx')>('components/portal-photo-preview.tsx', { react: hooks.react })
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
