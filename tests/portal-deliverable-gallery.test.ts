import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { loadTs } from './helpers/load-ts.ts'
import { componentHarness, elements } from './helpers/component-harness.ts'

const files = [1, 2].map(id => ({ id: String(id), fileName: `EDITED-${id}.JPG`, mimeType: 'image/jpeg',
  previewUrl: `/api/editor-workflow/portal/private/file/${id}?kind=deliverable` }))

function setup() {
  const hooks = componentHarness()
  const preview = { PhotoSelectButton: () => null, PortalPhotoPreview: () => null }
  const { default: Gallery } = loadTs<typeof import('../components/portal-deliverable-gallery.tsx')>(
    'components/portal-deliverable-gallery.tsx', { react: hooks.react, '@/components/portal-photo-preview': preview })
  return { preview, unmount: hooks.unmount, render: (photos = files) => hooks.render(() => Gallery({ files: photos })) }
}

test('delivered photos open the existing preview in place, reuse protected image URLs, and keep the grid styling', t => {
  const f = setup(); t.after(f.unmount)
  let tree = f.render()
  const tiles = elements(tree, el => el.type === f.preview.PhotoSelectButton)
  assert.equal(tiles.length, 2)
  assert.ok(tiles.every(tile => tile.props.locked === true), 'delivered photos never change selection choices')
  assert.equal(elements(tree, el => el.type === 'a').length, 0, 'no new tab or download is triggered by previewing')
  assert.match(tiles[0].props.className, /hover:-translate-y-1/)
  assert.match(elements(tree, el => el.type === 'div')[0].props.className, /grid-cols-2 gap-3 sm:grid-cols-3/)
  const images = elements(tree, el => el.type === 'img')
  assert.deepEqual(images.map(image => image.props.src), files.map(file => file.previewUrl))
  assert.ok(images.every(image => image.props.loading === 'lazy' && image.props.decoding === 'async' && image.props.draggable === false))
  tiles[0].props.onPreview(files[0]); tree = f.render()
  let viewer = elements(tree, el => el.type === f.preview.PortalPhotoPreview)[0]
  assert.equal(viewer.props.file, files[0])
  viewer.props.onClose(); tree = f.render()
  assert.equal(elements(tree, el => el.type === f.preview.PortalPhotoPreview).length, 0)
  tiles[1].props.onPreview(files[1]); tree = f.render()
  viewer = elements(tree, el => el.type === f.preview.PortalPhotoPreview)[0]
  assert.equal(viewer.key, files[1].id, 'each photo mounts its own fresh zoom state')
  assert.equal(viewer.props.file.previewUrl, files[1].previewUrl)
})

test('background updates remove a deleted delivered-photo preview and cannot reopen it later', t => {
  const f = setup(); t.after(f.unmount)
  let tree = f.render()
  elements(tree, el => el.type === f.preview.PhotoSelectButton)[0].props.onPreview(files[0])
  tree = f.render()
  assert.equal(elements(tree, el => el.type === f.preview.PortalPhotoPreview).length, 1)
  tree = f.render([])
  assert.equal(elements(tree, el => el.type === f.preview.PortalPhotoPreview).length, 0)
  tree = f.render()
  assert.equal(elements(tree, el => el.type === f.preview.PortalPhotoPreview).length, 0)
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
})
