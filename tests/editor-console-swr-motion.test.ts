import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

test('editor does not install a route-level skeleton that replaces cached pages', () => {
  assert.equal(existsSync('app/editor/loading.tsx'), false)
})

test('editor uses the admin typography baseline', () => {
  const layout = readFileSync('app/editor/layout.tsx', 'utf8')
  const motion = readFileSync('app/console-motion.css', 'utf8')
  assert.match(layout, /editor-console/)
  assert.match(motion, /\.editor-console main[\s\S]*font-family: var\(--font-geist-sans\)/)
  assert.match(motion, /\.editor-console main h1[\s\S]*font-family: inherit/)
})

test('admin and editor page roots share subtle upward route motion with reduced-motion support', () => {
  const motion = readFileSync('app/console-motion.css', 'utf8')
  assert.match(motion, /\.admin-console main > \*/)
  assert.match(motion, /translate3d\(0, 6px, 0\)/)
  assert.match(motion, /180ms cubic-bezier/)
  assert.match(motion, /prefers-reduced-motion: reduce/)
})
