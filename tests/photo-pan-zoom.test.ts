import assert from 'node:assert/strict'
import test from 'node:test'
import { constrainPhotoView, FIT_PHOTO, transformPhotoGesture, zoomPhotoWithWheel } from '../lib/photo-pan-zoom.ts'
import * as gestures from '../lib/photo-pan-zoom.ts'
import { loadTs } from './helpers/load-ts.ts'
import { componentHarness, elements } from './helpers/component-harness.ts'

const bounds = { width: 400, height: 600, imageWidth: 400, imageHeight: 600 }

test('pinch zoom keeps the photo under the moving midpoint, instead of resizing the scroll container', () => {
  const next = transformPhotoGesture(FIT_PHOTO, [{ x: -50, y: 0 }, { x: 50, y: 0 }], [{ x: -50, y: 20 }, { x: 150, y: 20 }], bounds)
  assert.deepEqual(next, { scale: 2, x: 50, y: 20 })
  const start = { scale: 2, x: -20, y: -40 }
  const anchored = transformPhotoGesture(start, [{ x: -50, y: 20 }, { x: 50, y: 20 }], [{ x: -75, y: 20 }, { x: 75, y: 20 }], bounds)
  assert.deepEqual(anchored, { scale: 3, x: -30, y: -70 })
})

test('dragging is clamped to photo edges and zooming back to fit recenters it', () => {
  assert.deepEqual(constrainPhotoView({ scale: 2, x: 999, y: -999 }, bounds), { scale: 2, x: 200, y: -300 })
  assert.deepEqual(constrainPhotoView({ scale: 1, x: 200, y: -300 }, bounds), FIT_PHOTO)
  assert.equal(constrainPhotoView({ scale: 50, x: 0, y: 0 }, bounds).scale, 3)
  assert.equal(constrainPhotoView({ scale: 0.1, x: 0, y: 0 }, bounds).scale, 1)
})

test('landscape and portrait letterboxing use the actual contained image for pan limits', () => {
  const landscape = { ...bounds, imageWidth: 1600, imageHeight: 900 }
  assert.deepEqual(constrainPhotoView({ scale: 2, x: 999, y: 999 }, landscape), { scale: 2, x: 200, y: 0 })
  const portrait = { width: 1000, height: 600, imageWidth: 400, imageHeight: 600 }
  assert.deepEqual(constrainPhotoView({ scale: 2, x: 999, y: 999 }, portrait), { scale: 2, x: 0, y: 300 })
})

test('coincident fingers and missing pointers never create an invalid transform', () => {
  assert.deepEqual(transformPhotoGesture(FIT_PHOTO, [{ x: 1, y: 1 }, { x: 1, y: 1 }], [{ x: 0, y: 0 }, { x: 100, y: 100 }], bounds), FIT_PHOTO)
  assert.deepEqual(transformPhotoGesture(FIT_PHOTO, [], [], bounds), FIT_PHOTO)
})

test('mouse wheel zooms around the cursor and normalizes line, page and trackpad deltas', () => {
  const cursor = { x: 80, y: 120 }
  const zoomed = zoomPhotoWithWheel(FIT_PHOTO, -100, 0, cursor, bounds)
  assert.ok(zoomed.scale > 1)
  assert.ok(Math.abs((cursor.x - zoomed.x) / zoomed.scale - cursor.x) < 0.00001)
  assert.ok(Math.abs((cursor.y - zoomed.y) / zoomed.scale - cursor.y) < 0.00001)
  assert.deepEqual(zoomPhotoWithWheel(FIT_PHOTO, -1, 1, cursor, bounds), zoomPhotoWithWheel(FIT_PHOTO, -16, 0, cursor, bounds))
  assert.equal(zoomPhotoWithWheel({ scale: 3, x: 0, y: 0 }, -9999, 2, cursor, bounds).scale, 3)
  assert.deepEqual(zoomPhotoWithWheel(FIT_PHOTO, 100, 0, cursor, bounds), FIT_PHOTO)
  assert.equal(zoomPhotoWithWheel(FIT_PHOTO, 0, 0, cursor, bounds).scale, 1)
})

for (const kind of ['gallery', 'deliverable']) test(`${kind} preview handlers support two-finger pinch, one-finger drag, cancellation and existing buttons`, () => {
  const hooks = componentHarness()
  const loaded = loadTs<typeof import('../components/portal-photo-preview.tsx')>('components/portal-photo-preview.tsx', {
    react: { ...hooks.react, useCallback: <T,>(fn: T) => fn }, '@/lib/photo-pan-zoom': gestures,
  })
  let closed = 0
  const file = { id: 'synthetic', fileName: 'sample.jpg', mimeType: 'image/jpeg', previewUrl: `/api/editor-workflow/portal/private/file/synthetic?kind=${kind}` }
  const render = () => hooks.render(() => loaded.PortalPhotoPreview({ file, onClose: () => { closed++ } }))
  let tree = render()
  let viewport = elements(tree, el => el.props.role === 'region')[0]
  let image = elements(tree, el => el.type === 'img')[0]
  const captured = new Set<number>()
  const listeners = new Map<string, (event: { deltaY: number; deltaMode: number; clientX: number; clientY: number; preventDefault: () => void }) => void>()
  const surface = {
    clientWidth: 400, clientHeight: 600,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 600 }),
    setPointerCapture: (id: number) => captured.add(id), hasPointerCapture: (id: number) => captured.has(id),
    releasePointerCapture: (id: number) => captured.delete(id), focus() {},
    addEventListener: (name: string, listener: typeof listeners extends Map<string, infer L> ? L : never, options: { passive?: boolean }) => {
      assert.equal(options.passive, false, 'wheel listener can prevent the page/browser from scrolling or zooming')
      listeners.set(name, listener)
    },
    removeEventListener: (name: string) => listeners.delete(name),
  }
  viewport.props.ref.current = surface
  image.props.ref.current = { naturalWidth: 400, naturalHeight: 600 }
  const pointer = (pointerId: number, clientX: number, clientY = 300) => ({ pointerId, clientX, clientY, button: 0, currentTarget: surface, preventDefault() {} })
  viewport.props.onPointerDown(pointer(1, 150))
  viewport.props.onPointerDown(pointer(2, 250))
  viewport.props.onPointerMove(pointer(2, 350))
  tree = render()
  image = elements(tree, el => el.type === 'img')[0]
  assert.equal(image.props.style.transform, 'translate3d(50px, 0px, 0) scale(2)')
  assert.equal(image.props.src, file.previewUrl, 'reuses the protected cached preview, not the RAW original')
  viewport = elements(tree, el => el.props.role === 'region')[0]
  viewport.props.onPointerUp(pointer(2, 350))
  viewport.props.onPointerMove(pointer(1, 110, 340))
  tree = render()
  assert.equal(elements(tree, el => el.type === 'img')[0].props.style.transform, 'translate3d(10px, 40px, 0) scale(2)')
  viewport = elements(tree, el => el.props.role === 'region')[0]
  viewport.props.onPointerCancel(pointer(1, 110, 340))
  viewport.props.onPointerMove(pointer(1, 200, 440))
  tree = render()
  assert.equal(elements(tree, el => el.type === 'img')[0].props.style.transform, 'translate3d(10px, 40px, 0) scale(2)')
  assert.equal(captured.size, 0)
  assert.match(viewport.props.className, /touch-none.*overflow-hidden/)
  assert.doesNotMatch(viewport.props.className, /overflow-auto|overflow-scroll/)
  assert.equal(closed, 0, 'gestures do not close the preview or select a photo')
  elements(tree, el => el.props['aria-label'] === 'Zoom out')[0].props.onClick()
  tree = render()
  assert.equal(elements(tree, el => el.type === 'img')[0].props.style.transform, 'translate3d(0px, 0px, 0) scale(1)')
  let prevented = 0
  listeners.get('wheel')!({ deltaY: -200, deltaMode: 0, clientX: 230, clientY: 330, preventDefault: () => { prevented++ } })
  tree = render()
  assert.equal(prevented, 1)
  assert.doesNotMatch(elements(tree, el => el.type === 'img')[0].props.style.transform, /scale\(1\)$/)
  assert.equal(elements(tree, el => el.type === 'p').length, 0, 'instruction footer is removed')
  elements(tree, el => el.props['aria-label'] === 'Close photo preview')[0].props.onClick()
  assert.equal(closed, 1)
  hooks.unmount()
  assert.equal(listeners.size, 0, 'wheel listener is cleaned up with the preview')
})
