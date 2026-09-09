// Isolated browser verification: requests are intercepted, never sent to live services.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync, mkdirSync } from 'node:fs'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PORTAL_PLAYWRIGHT_PATH || 'playwright')
const base = process.env.PORTAL_TEST_URL || 'http://127.0.0.1:3100'
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)) throw new Error('This verification only targets a local server.')
const id = '00000000-0000-4000-8000-000000000042'
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const photo = n => ({ id: uuid(n + 100), fileName: `PHOTO-${String(n + 1).padStart(4, '0')}.JPG`, mimeType: 'image/jpeg', previewUrl: `${base}/api/editor-workflow/portal/${id}/file/${uuid(n + 100)}?kind=gallery` })
const addons = [
  { id: uuid(1), name: 'Extra Edit', description: 'Additional enhanced photo', price: 400, pricingType: 'per_photo', maxQuantity: 200, photoLimit: 0 },
  { id: uuid(2), name: '11×14 Frame', description: 'Printed and framed', price: 1500, pricingType: 'fixed', maxQuantity: 1, photoLimit: 1 },
  { id: uuid(3), name: '8R Frame', description: 'Printed and framed', price: 1000, pricingType: 'fixed', maxQuantity: 1, photoLimit: 1 },
  { id: uuid(4), name: '4 pcs Wallet Size', description: 'Four wallet prints', price: 100, pricingType: 'fixed', maxQuantity: 1, photoLimit: 4 },
  { id: uuid(5), name: '2 pcs 4R Size', description: 'Two prints', price: 100, pricingType: 'fixed', maxQuantity: 1, photoLimit: 2 },
  { id: uuid(6), name: 'A4 Size Printed', description: 'One print', price: 350, pricingType: 'fixed', maxQuantity: 1, photoLimit: 1 },
]
const selection = { id: uuid(9), status: 'OPEN', requiredCount: 5, includedLimit: 5, clientStatus: 'Not Started', noRevisionAcknowledged: false, selectedIds: [], selectedItems: [], printAllocations: [], addonOrders: [], totalAddonAmount: 0, rawUploadGeneration: 0 }
let imageBody = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#c7c2b9"/><circle cx="300" cy="280" r="110" fill="#958a80"/><path d="M100 800V570a200 200 0 0 1 400 0v230" fill="#423c3a"/></svg>')
let imageType = 'image/svg+xml'
if (process.env.PORTAL_REFERENCE_HTML) {
  const match = readFileSync(process.env.PORTAL_REFERENCE_HTML, 'utf8').match(/const imageSrc='data:image\/([^;]+);base64,([^']+)'/)
  if (match) { imageBody = Buffer.from(match[2], 'base64'); imageType = `image/${match[1]}` }
}
mkdirSync('artifacts/portal-prototype', { recursive: true })
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
const errors = []
const results = []
async function fixture(width = 1440, count = 50, saved = selection, options = {}) {
  const context = await browser.newContext({ viewport: { width, height: width > 900 ? 1000 : 844 }, isMobile: width <= 900, hasTouch: width <= 900 })
  const page = await context.newPage()
  page.on('pageerror', e => errors.push(e.message))
  page.on('dialog', async dialog => { errors.push(`Browser-native ${dialog.type()}: ${dialog.message()}`); await dialog.dismiss() })
  const posts = []
  let releaseImages
  const imageGate = options.delayImages ? new Promise(resolve => { releaseImages = resolve }) : Promise.resolve()
  const portal = { booking: { id: 'QA-PORTAL', customerName: 'Portal Preview', packageName: 'MANA PACKAGE', bookingDate: '2026-09-11', bookingTime: '', bookingStatus: 'Confirmed', paymentStatus: 'Paid Deposit', price: 6500, amountPaid: 500, depositAmount: 500 }, portalId: id, shareUrl: `${base}/portal/${id}`, expiry: { days: 30, portalReadyEmailSentAt: null, deliverablesUploadedAt: null, expiresAt: null }, selection: structuredClone(saved), galleryTotal: count, galleryLimit: 48, galleryOffset: 0, editingStatus: 'WAITING_FOR_SELECTION', addonCatalog: addons, deliverables: [], resources: [], downloadAllUrl: `${base}/api/editor-workflow/portal/${id}/deliverables.zip`, warnings: [] }
  await page.route('**/api/editor-workflow/portal/**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname.includes('/file/')) { await imageGate; return route.fulfill({ contentType: imageType, body: imageBody }) }
    if (url.pathname.endsWith('/photo-revision')) return route.fulfill({ json: { generation: 0, galleryCount: count, reopenedAt: null, expiresAt: null, portalReadyEmailSentAt: null } })
    if (route.request().method() === 'POST') {
      posts.push(route.request().postDataJSON())
      if (options.submitSuccess) {
        const input=posts.at(-1)
        portal.selection={...portal.selection,status:'SUBMITTED',clientStatus:'Submitted',noRevisionAcknowledged:true,
          selectedItems:input.fileIds.map(fileId=>({fileId,preference:'standard',extraEdit:input.extraEditFileIds.includes(fileId)})),
          printAllocations:input.printAllocations,submittedAt:new Date().toISOString()}
        return route.fulfill({json:{ok:true}})
      }
      return route.fulfill({ status: 403, json: { error: 'Incorrect PIN. Your choices have been preserved.', code: 'SELECTION_PIN_INVALID' } })
    }
    const offset = Number(url.searchParams.get('offset') || 0)
    const gallery = Array.from({ length: Math.min(48, Math.max(0, count - offset)) }, (_, index) => photo(index + offset))
    return route.fulfill({ json: { ...portal, gallery, galleryOffset: offset } })
  })
  await page.goto(`${base}/portal/${id}`)
  await page.getByRole('button', { name: 'Overview', exact: true }).waitFor()
  await page.getByTestId('portal-contact-sheet').waitFor()
  return { page, context, posts, portal, releaseImages }
}
try {
  const f = await fixture()
  await f.page.screenshot({ animations: 'disabled', path: 'artifacts/portal-prototype/photos-desktop.png' })
  assert.equal(await f.page.getByRole('button', { name: 'Select 5 more photos', exact: true }).isVisible(), true)
  const first = f.page.getByTestId('portal-contact-sheet').getByRole('button').first()
  await first.click()
  assert.equal(await first.getAttribute('aria-pressed'), 'false', 'Desktop click only previews')
  await f.page.getByRole('button', { name: 'Select Photo', exact: true }).click()
  assert.equal(await first.getAttribute('aria-pressed'), 'true')
  assert.equal(await f.page.getByRole('button', { name: 'Select 4 more photos', exact: true }).isVisible(), true)
  await f.page.evaluate(() => window.scrollTo(0, 2200))
  const preview = await f.page.getByRole('complementary', { name: 'Large photo preview' }).boundingBox()
  assert.ok(preview.y >= 0 && preview.y + preview.height <= 1000, 'Preview stays in viewport')
  const cta = await f.page.getByRole('button', { name: 'Select 4 more photos', exact: true }).boundingBox()
  assert.ok(cta.x + cta.width < preview.x, 'CTA does not overlap preview')
  await f.page.screenshot({ animations: 'disabled', path: 'artifacts/portal-prototype/photos-desktop-scrolled.png' })
  await f.context.close()
  results.push('Desktop preview-only click, selection CTA, sticky preview, and non-overlapping CTA passed')
  const m = await fixture(390, 20)
  const cards = m.page.getByTestId('portal-contact-sheet').locator('button[data-selected]')
  for (let n = 0; n < 5; n++) await cards.nth(n).tap()
  await m.page.getByRole('heading', { name: 'Your 5 included photos are complete.' }).waitFor()
  await m.page.getByRole('button', { name: 'Keep Selecting', exact: true }).click()
  await cards.nth(5).tap()
  assert.equal(await cards.nth(5).getAttribute('data-extra'), 'true')
  await cards.nth(0).tap()
  assert.equal(await cards.nth(5).getAttribute('data-extra'), 'false', 'Earliest extra is promoted when included photo is removed')
  await m.page.screenshot({ animations: 'disabled', path: 'artifacts/portal-prototype/photos-mobile.png' })
  await m.page.getByRole('button', { name: 'Continue to Free Prints →', exact: true }).click()
  const printGroups = m.page.locator('fieldset')
  assert.equal(await printGroups.count(), 4)
  for (let n = 0; n < 4; n++) {
    assert.equal(await printGroups.nth(n).getByRole('button').count(), 5, 'Only included photos appear in free prints')
    await printGroups.nth(n).getByRole('button').first().tap()
  }
  await m.page.screenshot({ animations: 'disabled', path: 'artifacts/portal-prototype/free-prints-mobile.png' })
  await m.page.getByRole('button', { name: 'Continue to Add-ons →' }).click()
  await m.page.getByRole('button', { name: 'Add 11×14 Frame', exact: true }).tap()
  const frame = m.page.locator('[data-addon-id="' + uuid(2) + '"]')
  await frame.getByRole('button', { name: /Use PHOTO-0002.JPG/ }).tap()
  await m.page.getByRole('button', { name: 'Add 8R Frame', exact: true }).tap()
  assert.equal(await frame.getByRole('button', { name: /Remove PHOTO/ }).count(), 0, 'Earlier picker collapses')
  await m.page.getByRole('button', { name: 'Configure 11×14 Frame', exact: true }).tap()
  assert.equal(await frame.getByRole('button', { name: /Remove PHOTO-0002.JPG/ }).getAttribute('aria-pressed'), 'true', 'Assignment survives collapse')
  await m.page.getByRole('button', { name: 'Configure 11×14 Frame', exact: true }).tap()
  assert.equal(await frame.getByRole('button', { name: /Remove PHOTO/ }).count(), 0, 'Same selected row collapses without removing add-on')
  await m.page.getByRole('button', { name: 'Remove 8R Frame', exact: true }).tap()
  await m.page.getByRole('button', { name: 'Configure 11×14 Frame', exact: true }).tap()
  await m.page.screenshot({ animations: 'disabled', path: 'artifacts/portal-prototype/addons-mobile.png' })
  assert.equal(await m.page.getByRole('button', { name: 'Continue to Review →' }).isEnabled(), true)
  await m.page.getByRole('button', { name: 'Continue to Review →' }).click()
  const checkout = m.page.getByRole('complementary', { name: 'Payment summary' })
  assert.match(await checkout.innerText(), /₱7,500/)
  await m.page.getByRole('checkbox').check()
  await m.page.getByRole('button', { name: 'Submit Final Selection', exact: true }).click()
  await m.page.getByLabel('Final submission PIN').fill('0000')
  await m.page.getByRole('button', { name: 'Confirm & Submit', exact: true }).click()
  await m.page.getByRole('dialog').getByRole('alert').waitFor()
  assert.equal(m.posts[0].addons[0].photoIds[0], uuid(101))
  assert.equal(m.posts[0].printAllocations.length, 4)
  assert.equal(await m.page.getByLabel('Final submission PIN').inputValue(), '')
  await m.page.getByRole('button', { name: 'Go back', exact: true }).click()
  await m.page.getByRole('button', { name: 'Overview', exact: true }).click()
  await m.page.getByRole('dialog').getByRole('heading', { name: 'Overview', exact: true }).waitFor()
  await m.page.keyboard.press('Escape')
  await m.page.getByRole('dialog').waitFor({ state: 'hidden' })
  await m.page.screenshot({ animations: 'disabled', path: 'artifacts/portal-prototype/review-mobile.png' })
  results.push('Review totals, assigned-photo payload, invalid-PIN feedback and Overview Escape dismissal passed')
  results.push('Free print included-only choices, inline add-on picker, accordion persistence and removal passed')
  await m.context.close()
  results.push('Mobile tap, five-photo sheet, extra selection, and deterministic promotion passed')
  for (const width of [1280,1440,1536,1920,320,360,375,390,412,430]) {
    const v = await fixture(width, 20)
    assert.equal(await v.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `No horizontal overflow at ${width}px`)
    await v.page.evaluate(() => window.scrollTo(0,1000))
    const header = await v.page.locator('header').first().boundingBox()
    const nav = await v.page.getByRole('navigation', { name: 'Selection workflow' }).boundingBox()
    assert.ok(await v.page.getByRole('navigation', { name: 'Selection workflow' }).evaluate(element => parseFloat(getComputedStyle(element).borderRadius) > 0), 'Rounded navigation container')
    assert.ok(await v.page.getByRole('button', { name: /PHOTOS/, exact: false }).first().evaluate(element => parseFloat(getComputedStyle(element).borderRadius) > 0), 'Rounded workflow buttons')
    assert.ok(header.y >= 0 && nav.y + nav.height <= header.y + header.height + 1, `Merged sticky navigation at ${width}px`)
    const preview = v.page.getByRole('complementary', { name: 'Large photo preview' })
    if (width <= 900) assert.equal(await preview.isVisible(),false)
    else { const box=await preview.boundingBox();assert.ok(box.y >= 0 && box.y+box.height <= 1000, `Visible desktop preview ${width}`) }
    if ([320,1920].includes(width)) await v.page.screenshot({ animations: 'disabled',path:`artifacts/portal-prototype/viewport-${width}.png`})
    await v.context.close()
  }
  results.push('All ten requested desktop/mobile viewport widths passed overflow and sticky-navigation checks')
  for (const count of [5,20,50,100,200]) {
    const g=await fixture(1440,count)
    while (await g.page.getByRole('button',{name:/Load More Photos/}).count()) {
      await g.page.getByRole('button',{name:/Load More Photos/}).click()
      await g.page.getByRole('button',{name:'Loading more…'}).waitFor({state:'hidden'})
    }
    assert.equal(await g.page.getByTestId('portal-contact-sheet').locator('button[data-selected]').count(),count)
    await g.page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight))
    const box=await g.page.getByRole('complementary',{name:'Large photo preview'}).boundingBox()
    assert.ok(box.y>=0 && box.y+box.height<=1000,`Preview stays visible through ${count} photos`)
    await g.context.close()
  }
  for (const count of [0,1,4,5,6,10]) {
    const saved={...selection,selectedItems:Array.from({length:count},(_,n)=>({fileId:photo(n).id,preference:'standard',extraEdit:n>=5}))}
    const c=await fixture(390,20,saved)
    const label=count<5?`Select ${5-count} more photo${count===4?'':'s'}`:'Continue to Free Prints →'
    const button=c.page.getByRole('button',{name:label,exact:true})
    assert.equal(await button.isVisible(),true)
    assert.equal(await button.isEnabled(),count>=5)
    if(count<5)assert.equal(await button.evaluate(element=>getComputedStyle(element).opacity),'1')
    await c.context.close()
  }
  results.push('Gallery sizes 5/20/50/100/200 and selection counts 0/1/4/5/6/10 passed')
  const gesture=await fixture(320,20)
  await gesture.page.clock.install()
  const firstCard=gesture.page.getByTestId('portal-contact-sheet').locator('button[data-selected]').first()
  const pointer={isPrimary:true,button:0,pointerId:1,clientX:30,clientY:100,pointerType:'touch'}
  await firstCard.dispatchEvent('pointerdown',pointer)
  await gesture.page.clock.fastForward(450)
  await gesture.page.getByRole('dialog',{name:'PHOTO-0001.JPG'}).waitFor()
  const dialogBox=await gesture.page.getByRole('dialog').boundingBox()
  assert.ok(dialogBox.x>=0 && dialogBox.x+dialogBox.width<=320)
  await gesture.page.keyboard.press('Escape')
  assert.equal(await firstCard.getAttribute('aria-pressed'),'false')
  await firstCard.dispatchEvent('pointerdown',pointer)
  await firstCard.dispatchEvent('pointermove',{...pointer,clientY:150})
  await gesture.page.clock.fastForward(500)
  await firstCard.dispatchEvent('pointerup',pointer)
  assert.equal(await gesture.page.getByRole('dialog').count(),0)
  await gesture.context.close()
  const skeleton=await fixture(390,20,selection,{delayImages:true})
  const skeletonCard=skeleton.page.getByTestId('portal-contact-sheet').locator('button[data-selected]').first()
  const before=await skeletonCard.boundingBox()
  assert.equal(await skeletonCard.locator('[data-loaded="false"]').count(),1)
  skeleton.releaseImages()
  await skeletonCard.locator('[data-loaded="true"]').waitFor()
  const after=await skeletonCard.boundingBox()
  assert.equal(before.height,after.height)
  await skeleton.context.close()
  results.push('Mobile long press, scroll cancellation, preview-only behavior and layout-matched image skeleton passed')
  const ready={...selection,noRevisionAcknowledged:true,selectedItems:Array.from({length:5},(_,n)=>({fileId:photo(n).id,preference:'standard',extraEdit:false})),
    printAllocations:['TOGA_PICTURE_4R','ALAMPAY_BARONG_4R','FRAME_8R','WALLET_SIZE'].map(category=>({category,fileId:photo(0).id,quantity:1,label:category}))}
  const success=await fixture(320,20,ready,{submitSuccess:true})
  await success.page.getByRole('button',{name:'REVIEW',exact:true}).click()
  await success.page.getByRole('button',{name:'Submit Final Selection',exact:true}).click()
  await success.page.getByLabel('Final submission PIN').fill('0042')
  await success.page.getByRole('button',{name:'Confirm & Submit',exact:true}).click()
  await success.page.getByText('Selection submitted',{exact:true}).waitFor()
  await success.page.getByText('Your final selection has been submitted. Duplicate submission is blocked.',{exact:true}).waitFor()
  assert.equal(success.posts.length,1)
  assert.equal(await success.page.getByRole('button',{name:'Submit Final Selection',exact:true}).count(),0)
  assert.equal(await success.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
  await success.context.close()
  results.push('Successful submission uses the reused Admin toast and locks against duplicate submission at 320px')
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ results, errors }, null, 2))
} finally { await browser.close() }
