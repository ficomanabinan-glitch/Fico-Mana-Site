import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

// Export the existing homepage screenshot, not a redesigned or AI-generated hero.
// This is a maintenance command, NOT a build-time or request-time dependency.
const source = new URL('../public/preview.png', import.meta.url)
const target = new URL('../public/social/ficomana-homepage-v4.jpg', import.meta.url)
const bytes = await sharp(await readFile(source))
  .resize(1200, 630, { fit: 'contain', background: '#1c2e22' })
  .flatten({ background: '#1c2e22' })
  .toColourspace('srgb')
  .jpeg({ quality: 90, chromaSubsampling: '4:4:4', progressive: false })
  .toBuffer()
assert.ok(bytes.length < 250_000, 'Social preview exceeds the 250 KB delivery budget')
await mkdir(new URL('../public/social/', import.meta.url), { recursive: true })
try {
  await writeFile(target, bytes, { flag: 'wx' })
} catch (error) {
  if (error.code !== 'EEXIST') throw error
  assert.ok(bytes.equals(await readFile(target)),
    'Do not overwrite published social images. Choose a new versioned filename first.')
}
console.log(`Static homepage preview: 1200 x 630 JPEG, ${bytes.length} bytes`)
