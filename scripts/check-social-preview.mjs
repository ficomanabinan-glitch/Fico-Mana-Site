import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import sharp from 'sharp'

// Read-only checks. No cookies, login tokens, JavaScript rendering or redirect following.
const origin = new URL(process.argv[2] || 'https://www.ficomana.com').origin
const canonical = 'https://www.ficomana.com/'
const imagePath = '/social/ficomana-homepage-v4.jpg'
const imageUrl = new URL(imagePath, canonical).href
const title = 'FICO MANA Studio — The Portrait of Success'
const description = 'FICO MANA is a premier self-portrait and graduation photography studio in Cabuyao, Laguna. Book your session for timeless portraits, professional lighting, and an unforgettable studio experience.'
const alt = 'FICO MANA homepage with the studio logo, graduation portrait, and The Portrait of Success headline'
const expected = {
  'og:title': title, 'og:description': description, 'og:url': canonical,
  'og:type': 'website', 'og:site_name': 'FICO MANA', 'og:image': imageUrl,
  'og:image:secure_url': imageUrl, 'og:image:type': 'image/jpeg',
  'og:image:width': '1200', 'og:image:height': '630', 'og:image:alt': alt,
  'twitter:card': 'summary_large_image', 'twitter:title': title,
  'twitter:description': description, 'twitter:image': imageUrl, 'twitter:image:alt': alt,
}
const agents = [
  'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  'Facebot', 'meta-externalfetcher/1.1', 'meta-externalagent/1.1', 'Twitterbot/1.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
]
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const referenceHash = hash(await readFile(new URL(`../public${imagePath}`, import.meta.url)))
const request = (url, agent, method = 'GET') => fetch(url, {
  method, redirect: 'manual', signal: AbortSignal.timeout(20_000),
  headers: { 'User-Agent': agent },
})
function publicOk(response, label) {
  assert.equal(response.status, 200, `${label}: HTTP ${response.status}`)
  assert.equal(response.headers.get('location'), null, `${label}: unexpected redirect`)
  assert.equal(response.headers.get('set-cookie'), null, `${label}: unexpected cookie`)
  assert.doesNotMatch(response.headers.get('x-robots-tag') || '', /noindex|noimageindex/i)
}
function metadataInHead(html) {
  const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1]
  assert.ok(head, 'Initial HTML must have a head element')
  const tags = new Map()
  let canonicalCount = 0
  let canonicalValue
  for (const tag of head.match(/<(?:meta|link)\b[^>]*>/gi) || []) {
    const attrs = Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, key, value]) => [key, value.replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"')]))
    const key = attrs.property || attrs.name
    if (key) tags.set(key, [...(tags.get(key) || []), attrs.content])
    if (attrs.rel === 'canonical') {
      canonicalCount += 1
      canonicalValue = attrs.href
      // Next serializes an origin-only URL without '/', which is the same root URL.
      assert.equal(new URL(attrs.href).href, canonical)
    }
  }
  assert.equal(canonicalCount, 1, 'Exactly one homepage canonical')
  for (const [key, value] of Object.entries(expected)) {
    if (key === 'og:url') {
      assert.deepEqual(tags.get(key), [canonicalValue], 'og:url must exactly match canonical')
      assert.equal(new URL(tags.get(key)[0]).href, value)
    } else assert.deepEqual(tags.get(key), [value], key)
  }
  assert.equal(tags.has('fb:app_id'), false, 'No fake App ID')
  assert.doesNotMatch((tags.get('robots') || []).join(), /noindex|noimageindex/i)
}

for (const agent of agents) {
  const homepage = await request(`${origin}/`, agent)
  publicOk(homepage, `${agent} homepage`)
  metadataInHead(await homepage.text())
  const image = await request(`${origin}${imagePath}`, agent)
  publicOk(image, `${agent} image`)
  assert.match(image.headers.get('content-type') || '', /^image\/jpeg\b/)
  assert.match(image.headers.get('cache-control') || '', /public.*max-age=31536000.*immutable/)
  const bytes = Buffer.from(await image.arrayBuffer())
  const info = await sharp(bytes).metadata()
  assert.equal(info.width, 1200); assert.equal(info.height, 630)
  assert.equal(info.format, 'jpeg'); assert.equal(hash(bytes), referenceHash)
  for (const path of ['/', imagePath]) publicOk(await request(`${origin}${path}`, agent, 'HEAD'), `${agent} HEAD ${path}`)
  console.log(`PASS ${agent}: initial metadata, homepage/image GET + HEAD 200, JPEG 1200x630, ${bytes.length} bytes, exact file hash`)
}
const robots = await request(`${origin}/robots.txt`, agents[0])
publicOk(robots, 'robots.txt')
const robotsText = await robots.text()
assert.match(robotsText, /User-Agent: \*\s+Allow: \/\s/i)
assert.doesNotMatch(robotsText, /Disallow: \/(?:social(?:\/|\s)|\s)/i)
console.log('PASS robots.txt allows the public homepage and social image')
if (origin === new URL(canonical).origin) {
  for (const suffix of ['/', '/?fbclid=social-preview-read-only-check']) {
    const apex = await request(`https://ficomana.com${suffix}`, agents[0])
    assert.equal(apex.status, 308)
    assert.equal(apex.headers.get('location'), `${origin}${suffix}`)
    const destination = await request(apex.headers.get('location'), agents[0])
    publicOk(destination, 'apex destination')
    metadataInHead(await destination.text())
  }
  console.log('PASS production apex redirects once to www with query parameters preserved')
}
console.log('These HTTP probes simulate user agents; Meta Sharing Debugger and a fresh Messenger account/device still require separate verification.')
