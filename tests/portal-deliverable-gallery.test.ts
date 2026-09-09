import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { portalExpiryNotice } from '../lib/portal-expiry.ts'
import { loadTs } from './helpers/load-ts.ts'
import { componentHarness, elements } from './helpers/component-harness.ts'

const files = [1, 2].map(id => ({ id: String(id), fileName: `EDITED-${id}.JPG`, mimeType: 'image/jpeg',
  previewUrl: `/api/editor-workflow/portal/private/file/${id}?kind=deliverable` }))

function setup() {
  const hooks = componentHarness()
  const preview = { PhotoSelectButton: () => null, PortalPhotoPreview: () => null }
  const PrivateImage = () => null
  const { default: Gallery } = loadTs<typeof import('../components/portal-deliverable-gallery.tsx')>(
    'components/portal-deliverable-gallery.tsx', { react: hooks.react, './portal-photo-preview': preview, './portal-private-image': PrivateImage, './portal-workspace.module.css': {} })
  return { preview, PrivateImage, unmount: hooks.unmount, render: (photos = files) => hooks.render(() => Gallery({ files: photos })) }
}

test('published hero and filmstrip reuse private URLs and open the existing preview without selection or new tabs', t => {
  const f=setup();t.after(f.unmount);let tree=f.render()
  assert.equal(elements(tree,el=>el.type==='a').length,0)
  const images=elements(tree,el=>el.type===f.PrivateImage)
  assert.equal(images[0].props.src,files[0].previewUrl)
  assert.deepEqual(images.slice(1).map(image=>image.props.src),files.map(file=>file.previewUrl))
  const button=(name:string)=>elements(tree,el=>el.type==='button'&&el.props['aria-label']===name)[0]
  button('View EDITED-2.JPG').props.onClick();tree=f.render()
  assert.equal(button('View EDITED-2.JPG').props['aria-pressed'],true)
  button('Preview EDITED-2.JPG').props.onClick();tree=f.render()
  const viewer=elements(tree,el=>el.type===f.preview.PortalPhotoPreview)[0]
  assert.equal(viewer.key,'2');assert.equal(viewer.props.file.previewUrl,files[1].previewUrl)
  assert.equal(viewer.props.onToggleSelection,undefined)
  viewer.props.onClose();tree=f.render()
  assert.equal(elements(tree,el=>el.type===f.preview.PortalPhotoPreview).length,0)
})
test('removed deliverables close the preview and do not reopen on subsequent refresh', t=>{
  const f=setup();t.after(f.unmount);let tree=f.render()
  elements(tree,el=>el.type==='button'&&el.props['aria-label']==='Preview EDITED-1.JPG')[0].props.onClick()
  tree=f.render();assert.equal(elements(tree,el=>el.type===f.preview.PortalPhotoPreview).length,1)
  tree=f.render([]);assert.equal(tree,null)
  tree=f.render();assert.equal(elements(tree,el=>el.type===f.preview.PortalPhotoPreview).length,0)
})

test('delivered-photo tap, long press and keyboard preview never select or double-open a photo', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const hooks = componentHarness(); t.after(hooks.unmount)
  const { PhotoSelectButton } = loadTs<typeof import('../components/portal-photo-preview.tsx')>(
    'components/portal-photo-preview.tsx', { react: hooks.react, '@/lib/photo-pan-zoom': {} })
  let previews = 0, selections = 0
  const button = hooks.render(() => PhotoSelectButton({ file: files[0], locked: true, onSelect: () => selections++,
    onPreview: file => { assert.equal(file, files[0]); previews++ }, className: 'preserve-gallery-style', children: null }))
  assert.match(button.props['aria-label'], /^Preview EDITED-1.JPG/)
  assert.match(button.props.className, /preserve-gallery-style/)
  const pointer = { isPrimary: true, button: 0, pointerId: 1, clientX: 10, clientY: 10 }
  const click = { preventDefault() {}, stopPropagation() {} }
  button.props.onPointerDown(pointer); button.props.onPointerUp(); button.props.onClick(click)
  assert.equal(previews, 1)
  button.props.onPointerDown(pointer); t.mock.timers.tick(450)
  assert.equal(previews, 2)
  button.props.onPointerUp(); button.props.onClick(click)
  assert.equal(previews, 2, 'release after a hold must not open a second preview')
  button.props.onKeyDown({ key: 'Enter' }); button.props.onClick(click)
  button.props.onKeyDown({ key: ' ' }); button.props.onClick(click)
  assert.equal(previews, 4)
  button.props.onPointerDown(pointer); button.props.onPointerMove({ ...pointer, clientY: 30 }); t.mock.timers.tick(500)
  button.props.onPointerDown(pointer); button.props.onPointerCancel(); t.mock.timers.tick(500)
  assert.equal(previews, 4, 'scrolling and interrupted gestures cancel the hold')
  assert.equal(selections, 0)
})

test('the portal keeps Download All separate from delivered-photo previews', () => {
  const source = readFileSync('app/portal/[id]/page.tsx', 'utf8')
  assert.match(source, /<PortalDeliverableGallery key=\{publicId\} files=\{data.deliverables\}/)
  assert.match(source, /<a href=\{data.downloadAllUrl\}/)
  assert.doesNotMatch(source, /href=\{file.previewUrl\} target="_blank"/)
  assert.match(source, /rounded-control border border-emerald-500\/20 bg-emerald-500\/\[0.05\]/)
})

test('the portal expiry notice states the deadline without explaining preview behavior', () => {
  assert.equal(portalExpiryNotice({ days: 30, portalReadyEmailSentAt: null, expiresAt: null }),
    'Your 30-day portal access period begins when FICO MANA releases your final enhanced photographs. Selecting photos and receiving the portal-ready email do not start the countdown.')
})
