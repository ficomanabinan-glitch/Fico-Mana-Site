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
  'part-01.txt',
  'part-02.txt',
  'part-03.txt',
  'part-04.txt',
  'part-05a.txt',
  'part-05b.txt',
  'part-06.txt',
]
const ogPartsDir = join(process.cwd(), 'assets', 'og-homepage')
const ogTarget = join(process.cwd(), 'public', 'og-homepage.jpg')
const expectedOgHash = 'cf2165b2b3b8d0a469fbbda7ce906691a6527a103037970956455e87d2c85875'

const encodedOg = (
  await Promise.all(ogParts.map(async (part) => (await readFile(join(ogPartsDir, part), 'utf8')).trim()))
).join('')
const ogBytes = Buffer.from(encodedOg, 'base64')
const ogHash = createHash('sha256').update(ogBytes).digest('hex')

if (ogBytes.length !== 35160 || ogHash !== expectedOgHash) {
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
