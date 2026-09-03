import { access, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const origin = (process.env.FICOMANA_ASSET_ORIGIN || 'https://www.ficomana.studio').replace(/\/$/, '')

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

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

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
