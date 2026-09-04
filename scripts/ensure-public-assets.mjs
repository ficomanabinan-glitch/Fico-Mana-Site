import { access, mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'

const origin = (process.env.FICOMANA_ASSET_ORIGIN || 'https://www.ficomana.studio').replace(/\/$/, '')

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

const ogParts = [
  ['part-01.txt', 4000, '0958475f2de1ef0e07500161017df4cbb580b3cb9d28488f07847e988ba0e2a5'],
  ['part-02.txt', 4000, 'ba83f22cb2d614b9714e7ad3e2886cee5e22bcefc5a7040dfd3b9a598fb14d25'],
  ['part-03.txt', 4000, 'e93d432edddbafc090b9f6a705e23ef84d331e49cad8f9dc13838ef82b8a2c56'],
  ['part-04.txt', 4000, '25ec5d74d22e31204cae083672c91440eec12bc832c8770a588508a000eff6f4'],
  ['part-05.txt', 4000, '3c73e23262065bcb40a0139ca0a7f003d92e72ab0f121dd220b0be76bfde92ef'],
  ['part-06.txt', 32, '37f75a73264487f0777352c02a07fbe7c46b8182fc0b456b0fb4b4d3f5cf3bc5'],
]
const ogPartsDir = join(process.cwd(), 'assets', 'og-homepage-q20')
const ogTarget = join(process.cwd(), 'public', 'og-homepage.jpg')
const expectedOgHash = 'fa08c02dc9fe0da7b6c2bf9d89922456463a30c6a7bb30e16238443aad1cbc6d'

const loadedParts = await Promise.all(ogParts.map(async ([part, expectedLength, expectedHash]) => {
  const value = (await readFile(join(ogPartsDir, part), 'utf8')).trim()
  const hash = createHash('sha256').update(value).digest('hex')
  if (value.length !== expectedLength || hash !== expectedHash) {
    throw new Error(`Social preview part mismatch ${part}: length ${value.length}/${expectedLength}, sha256 ${hash}/${expectedHash}`)
  }
  return value
}))

const encodedOg = loadedParts.join('')
const ogBytes = Buffer.from(encodedOg, 'base64')
const ogHash = createHash('sha256').update(ogBytes).digest('hex')

if (ogBytes.length !== 15023 || ogHash !== expectedOgHash) {
  throw new Error(`Homepage social preview verification failed: ${ogBytes.length} bytes, sha256 ${ogHash}`)
}

await writeFile(ogTarget, ogBytes)
console.log(`[assets] generated verified og-homepage.jpg (${ogBytes.length} bytes)`)

const legacyEncodedOgPath = join(process.cwd(), 'public', 'og-homepage.b64')
if (await exists(legacyEncodedOgPath)) {
  await unlink(legacyEncodedOgPath)
}

const requiredAssets = [
  'grad/grad_1.jpg',
  'grad/grad_2.jpg',
  'grad/grad_3.jpg',
  'grad/grad_4.jpg',
  'grad/grad_5.jpg',
  'grad/grad_6.jpg',
  'grad/grad_7.jpg',
  'grad/grad_8.jpg',
  'grad/grad_9.jpg',
  'model/model_2.jpg',
  'model/model_3.jpg',
  'model/model_5.jpg',
  'gray_bg.jpg',
  'green_bg.jpg',
  'retail_bg.jpg',
]

for (const asset of requiredAssets) {
  const target = join(process.cwd(), 'public', asset)
  if (await exists(target)) continue

  const url = `${origin}/${asset.split('/').map(encodeURIComponent).join('/')}`
  const response = await fetch(url, { redirect: 'follow' })

  if (!response.ok) {
    throw new Error(`Unable to restore ${asset}: ${response.status} ${response.statusText}`)
  }

  const bytes = Buffer.from(await response.arrayBuffer())
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, bytes)
  console.log(`[assets] restored ${asset} (${bytes.length} bytes)`)
}
