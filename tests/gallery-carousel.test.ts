import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('graduation carousel supports swipe and continuous automatic movement', async () => {
  const [gallery, styles] = await Promise.all([
    readFile('components/gallery.tsx', 'utf8'),
    readFile('app/globals.css', 'utf8'),
  ])

  assert.match(gallery, /gallery-swipe-carousel overflow-x-auto/)
  assert.match(gallery, /onPointerMove=\{handlePointerMove\}/)
  assert.match(gallery, /scroller\.scrollLeft \+= pixelsPerMillisecond \* elapsed/)
  assert.match(gallery, /window\.requestAnimationFrame\(advance\)/)
  assert.match(gallery, /if \(scroller\.scrollLeft >= sequenceWidth\)/)
  assert.match(gallery, /resumeAfterInteraction\(\)/)
  assert.match(gallery, /useReducedMotion\(\)/)
  assert.match(gallery, /aria-hidden=\{sequence === 1 \? true : undefined\}/)
  assert.match(gallery, /tabIndex=\{isClone \? -1 : undefined\}/)
  assert.doesNotMatch(gallery, /onMouseEnter=\{/)
  assert.doesNotMatch(gallery, /gallery-marquee-track/)

  assert.match(styles, /\.gallery-swipe-carousel \{/)
  assert.match(styles, /-webkit-overflow-scrolling: touch/)
  assert.match(styles, /\.gallery-swipe-carousel::\-webkit-scrollbar/)
  assert.doesNotMatch(styles, /@keyframes gallery-marquee/)
})
