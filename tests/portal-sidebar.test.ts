import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { loadTs } from './helpers/load-ts.ts'
import { componentHarness, elements, content } from './helpers/component-harness.ts'

test('desktop context stays sticky at the three-zone breakpoint and mobile leaves room for its action bar', () => {
  const css = readFileSync('app/globals.css', 'utf8')
  const start = css.indexOf('@media (min-width: 1280px)')
  const sidebar = css.slice(start, css.indexOf('.fico-portal-sheet-content', start))
  for (const text of ['.fico-portal-sidebar', 'position: sticky', 'align-self: start', 'max-height: calc(100dvh', 'overflow-y: auto', 'scrollbar-width: thin']) assert.ok(sidebar.includes(text))
  assert.match(css, /@media \(max-width: 767px\)[\s\S]*?\.client-portal-page[\s\S]*?padding-bottom: calc\(5\.5rem \+ env\(safe-area-inset-bottom/)
})

test('tablet and mobile details control reflects live balance, opens the same summary/QR content and closes on desktop resize', t => {
  const hooks = componentHarness()
  const sheets = { Sheet: () => null, SheetTrigger: () => null, SheetContent: () => null, SheetHeader: () => null, SheetTitle: () => null, SheetDescription: () => null }
  const media = { matches: false }
  let listener: (() => void) | undefined
  let removed = false
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { matchMedia: () => ({
    get matches() { return media.matches }, addEventListener: (_event: string, fn: () => void) => { listener = fn },
    removeEventListener: () => { removed = true },
  }) } })
  t.after(() => { hooks.unmount(); if (prior) Object.defineProperty(globalThis, 'window', prior); else Reflect.deleteProperty(globalThis, 'window') })
  const component = loadTs<typeof import('../components/portal-sidebar.tsx')>('components/portal-sidebar.tsx', { react: hooks.react, '@/components/ui/sheet': sheets })
  const render = (remaining = '₱6,000') => hooks.render(() => component.default({ remaining, children: 'Same payment and QR content' }))
  let tree = render()
  const sheet = () => elements(tree, el => el.type === sheets.Sheet)[0]
  const trigger = elements(tree, el => el.type === sheets.SheetTrigger)[0]
  assert.equal(sheet().props.open, false)
  assert.match(trigger.props.render.props.className, /min-h-12.*rounded-control/)
  assert.match(trigger.props.render.props.className, /xl:hidden/)
  assert.match(content(trigger), /₱6,000/)
  sheet().props.onOpenChange(true); tree = render('₱6,400')
  assert.equal(sheet().props.open, true)
  assert.match(content(elements(tree, el => el.type === sheets.SheetTrigger)[0]), /₱6,400/)
  const panel = elements(tree, el => el.type === sheets.SheetContent)[0]
  assert.equal(panel.props.side, 'bottom')
  assert.ok(panel.props.initialFocus, 'Focus the heading so opening does not scroll past the balance to QR actions')
  const aside = elements(tree, el => el.type === 'aside')[0]
  assert.match(aside.props.className, /xl:pr-6 2xl:pr-8/, 'Keep the card-to-scrollbar gutter aligned with the page gutter')
  assert.equal(aside.props.children, 'Same payment and QR content')
  media.matches = true; listener?.(); tree = render()
  assert.equal(sheet().props.open, false, 'Do not leave an invisible modal trapping focus after resize')
  hooks.unmount()
  assert.equal(removed, true)
})

test('PIN and balance are in the final confirmation, never above the review content', () => {
  const source = readFileSync('components/client-photo-selection.tsx', 'utf8')
  assert.ok(source.indexOf('data-testid="submission-balance"') < source.indexOf('id="mobile-submission-pin"'))
  assert.ok(source.indexOf('id="mobile-submission-pin"') < source.indexOf("'Confirm & Submit'"))
  assert.ok(!source.includes('id="submission-pin-help"'))
  assert.match(source, /paymentSummary: \{ packageAmount: number; amountPaid: number \}/)
  assert.match(source, /portalPaymentSummary\(paymentSummary.packageAmount, paymentSummary.amountPaid, addonTotal\)/)
})

