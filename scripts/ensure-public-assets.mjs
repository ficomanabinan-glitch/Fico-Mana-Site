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

const ogSource = join(process.cwd(), 'public', 'og-homepage-q8.b64')
const ogTarget = join(process.cwd(), 'public', 'og-homepage.jpg')
const encodedOg = (await readFile(ogSource, 'utf8')).trim()
const encodedHash = createHash('sha256').update(encodedOg).digest('hex')
if (encodedOg.length !== 12688 || encodedHash !== 'c31b7b4c90b64c2f7bbcf6cb83799c5edfc2a3c601d9930ecb5fe80f691464a9') {
  throw new Error(`Homepage social preview source mismatch: ${encodedOg.length} chars, sha256 ${encodedHash}`)
}

const ogBytes = Buffer.from(encodedOg, 'base64')
const ogHash = createHash('sha256').update(ogBytes).digest('hex')
if (ogBytes.length !== 9516 || ogHash !== 'fc3bf1bf129638f3ce92b3d07b4a6a321064095c59fce32edd9220019807bd2f') {
  throw new Error(`Homepage social preview verification failed: ${ogBytes.length} bytes, sha256 ${ogHash}`)
}

await writeFile(ogTarget, ogBytes)
await unlink(ogSource)
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
