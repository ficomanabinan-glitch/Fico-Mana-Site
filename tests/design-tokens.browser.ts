import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { chromium } from '@playwright/test'
import { adminPanel, adminInput, adminSelect, adminLabel, adminBtnPrimary, adminDrawer, adminModal } from '../lib/admin-ui.ts'

// Explicit browser parity check; kept outside *.test.ts so unit tests do not require Chromium.

const globals = postcss.parse(readFileSync('app/globals.css', 'utf8'))
const theme = globals.nodes.find(node => node.type === 'atrule' && node.name === 'theme')!
const scopes = globals.nodes.filter(node => node.type === 'rule' && [':root', '.dark', '.admin-console'].includes(node.selector))
const palette = scopes.map(node => node.toString()).join('\n')
const stopMotion = '* { transition: none !important; animation: none !important; }'

test('compiled staff token utilities retain surface, foreground, hover and alpha focus values', async () => {
  const helpers = { adminPanel, adminInput, adminSelect, adminLabel, adminBtnPrimary, adminDrawer, adminModal }
  // Baseline utility values are the incumbent implementation, not token names.
  const baseline = (classes: string) => classes
    .replaceAll('bg-staff-surface', 'bg-[#222222]')
    .replaceAll('text-staff-highlight', 'text-[#C4CEFF]')
    .replaceAll('border-staff-highlight', 'border-[#C4CEFF]')
    .replaceAll('ring-staff-highlight', 'ring-[#C4CEFF]')
    .replaceAll('text-staff-primary-foreground', 'text-[#11131b]')
    .replaceAll('bg-staff-primary-hover', 'bg-[#aebaff]')
  const candidates = Object.values(helpers).flatMap(value => [value, baseline(value)]).join(' ')
  const css = await postcss([tailwind({ optimize: false })]).process(
    `@import 'tailwindcss' source(none);\n${theme}\n@source inline(${JSON.stringify(candidates)});\n${palette}\n${stopMotion}`,
    { from: 'app/design-token-verification.css' },
  )
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    await page.setContent(`<style>${css.css}</style><div class="admin-console">${Object.entries(helpers).map(([name, classes]) =>
      `<button id="${name}" class="${classes}">Current</button><button id="${name}-baseline" class="${baseline(classes)}">Baseline</button>`,
    ).join('')}</div>`)
    const appearance = (id: string) => page.locator(`[id="${id}"]`).evaluate(element => {
      const style = getComputedStyle(element)
      return { background: style.backgroundColor, foreground: style.color, border: style.borderColor, shadow: style.boxShadow }
    })
    for (const name of Object.keys(helpers)) {
      assert.deepEqual(await appearance(name), await appearance(`${name}-baseline`), `${name} default appearance`)
    }
    assert.equal((await appearance('adminPanel')).background, 'rgb(34, 34, 34)')
    assert.equal((await appearance('adminLabel')).foreground, 'rgb(196, 206, 255)')
    assert.equal((await appearance('adminBtnPrimary')).background, 'rgb(143, 160, 255)')
    assert.equal((await appearance('adminBtnPrimary')).foreground, 'rgb(17, 19, 27)')
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary').trim().toLowerCase()), '#0500d0', 'public primary keeps studio blue')
    for (const name of ['adminInput', 'adminSelect']) {
      await page.locator(`[id="${name}"]`).focus()
      const current = await appearance(name)
      await page.locator(`[id="${name}-baseline"]`).focus()
      assert.deepEqual(current, await appearance(`${name}-baseline`), `${name} focus border and ring alpha`)
    }
    await page.locator('#adminBtnPrimary').hover()
    const hover = await appearance('adminBtnPrimary')
    await page.locator('#adminBtnPrimary-baseline').hover()
    assert.deepEqual(hover, await appearance('adminBtnPrimary-baseline'))
    assert.equal(hover.background, 'rgb(174, 186, 255)')
  } finally {
    await browser.close()
  }
})

test('portal action, brand and focus colors preserve the existing cascade inside staff scope', async () => {
  const moduleCss = readFileSync('components/portal-workspace.module.css', 'utf8').replace(/:global\(([^)]+)\)/g, '$1')
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    await page.setContent(`<style>${palette}\n${moduleCss}\n${stopMotion}</style>
      <div class="admin-console">
        <main class="portal clientPortal">
          <button id="action" class="primary">Continue</button>
          <button id="stage" class="step" aria-current="step">Stage</button>
          <div class="addonItem" data-selected="true"><span id="addon" class="addonIcon">Add-on</span></div>
          <label class="policy"><input id="policy" type="checkbox">Accept</label>
          <details><summary id="summary">Details</summary></details>
        </main>
        <section class="onboardingPage"><a id="onboarding" class="onboardingPrimary" href="#">Start</a></section>
      </div>`)
    const color = (id: string, property: string) => page.locator(`#${id}`).evaluate((element, property) =>
      getComputedStyle(element).getPropertyValue(property), property)
    for (const id of ['action', 'stage', 'onboarding']) {
      assert.equal(await color(id, 'background-color'), 'rgb(27, 22, 220)', `${id} editorial action`)
    }
    assert.equal(await color('action', 'border-top-color'), 'rgb(27, 22, 220)')
    assert.equal(await color('addon', 'background-color'), 'rgb(5, 0, 208)')
    assert.equal(await color('addon', 'border-top-color'), 'rgb(5, 0, 208)')
    assert.equal(await color('policy', 'accent-color'), 'rgb(5, 0, 208)')
    for (const id of ['action', 'onboarding']) {
      await page.locator(`#${id}`).hover()
      assert.equal(await color(id, 'background-color'), 'rgb(43, 37, 239)', `${id} hover`)
    }
    await page.keyboard.press('Tab')
    await page.locator('#summary').focus()
    assert.equal(await color('summary', 'outline-color'), 'rgb(165, 180, 252)')
    assert.equal(await color('summary', 'outline-width'), '2px')
    assert.equal(await color('summary', 'outline-offset'), '3px')
    assert.equal(await color('action', '--primary'), '#8fa0ff', 'staff accent remains scoped while portal brand stays independent')
  } finally {
    await browser.close()
  }
})
