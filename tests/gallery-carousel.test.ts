import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('graduation carousel supports swipe and continuous automatic movement', async () => {
  const [gallery, styles] = await Promise.all([
    readFile('components/gallery.tsx', 'utf8'),
    readFile('app/globals.css', 'utf8'),
  ])

  assert.match(gallery, /gallery-swipe-carousel overflow-x-auto/)
  assert.match(gallery, /aspect-\[4\/5\]/)
  assert.match(gallery, /className="object-cover/)
  assert.match(gallery, /onPointerMove=\{handlePointerMove\}/)
  assert.match(gallery, /scrollPositionRef\.current \+ pixelsPerMillisecond \* elapsed/)
  assert.match(gallery, /const pixelsPerMillisecond = 72 \/ 1000/)
  assert.match(gallery, /scroller\.scrollLeft = scrollPositionRef\.current/)
  assert.match(gallery, /window\.requestAnimationFrame\(advance\)/)
  assert.match(gallery, /scrollPositionRef\.current %=/)
  assert.match(gallery, /resumeAfterInteraction\(\)/)
  assert.match(gallery, /useWebsiteMedia\(\)/)
  assert.match(gallery, /isWebsiteMediaGallerySlotKey\(slot\.slotKey\)/)
  assert.match(gallery, /aria-hidden=\{sequence === 1 \? true : undefined\}/)
  assert.match(gallery, /tabIndex=\{isClone \? -1 : undefined\}/)
  assert.doesNotMatch(gallery, /onMouseEnter=\{/)
  assert.doesNotMatch(gallery, /onFocusCapture=\{/)
  assert.doesNotMatch(gallery, /useReducedMotion/)
  assert.doesNotMatch(gallery, /Pause automatic gallery movement/)
  assert.doesNotMatch(gallery, /Start automatic gallery movement/)
  assert.doesNotMatch(gallery, /gallery-marquee-track/)

  assert.match(styles, /\.gallery-swipe-carousel \{/)
  assert.match(styles, /-webkit-overflow-scrolling: touch/)
  assert.match(styles, /\.gallery-swipe-carousel::\-webkit-scrollbar/)
  assert.doesNotMatch(styles, /@keyframes gallery-marquee/)
})
