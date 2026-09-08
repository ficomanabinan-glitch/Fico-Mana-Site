import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { loadTs } from './helpers/load-ts.ts'
import { componentHarness, elements, content } from './helpers/component-harness.ts'

test('final portal uses a compact sticky identity/workflow system and golden-ratio desktop workspace', () => {
  const css = readFileSync('app/portal/portal-final.css', 'utf8')
  for (const text of [
    '--portal-phi: 1.618',
    '.portal-editorial-header',
    'position: sticky',
    '.portal-selection-steps',
    'grid-template-columns: minmax(0, 1.618fr) minmax(18rem, 1fr)',
    'env(safe-area-inset-top, 0px)',
    'env(safe-area-inset-bottom, 0px)',
    '.portal-header-compact .portal-project-id',
    '@media (prefers-reduced-motion: reduce)',
  ]) assert.ok(css.includes(text), `Expected final portal CSS to include ${text}`)

  assert.doesNotMatch(css, /\.fico-portal-sidebar\s*\{/)
})

test('Overview is one progressive-disclosure drawer on every viewport and reflects the live balance in its accessible name', t => {
  const hooks = componentHarness()
  const sheets = {
    Sheet: () => null,
    SheetTrigger: () => null,
    SheetContent: () => null,
    SheetHeader: () => null,
    SheetTitle: () => null,
    SheetDescription: () => null,
  }
  t.after(() => hooks.unmount())

  const component = loadTs<typeof import('../components/portal-sidebar.tsx')>(
    'components/portal-sidebar.tsx',
    { react: hooks.react, '@/components/ui/sheet': sheets },
  )

  const render = (remaining = '₱6,000') => hooks.render(() => component.default({
    remaining,
    children: 'Same booking, payment and QR content',
  }))

  let tree = render()
  const sheet = () => elements(tree, el => el.type === sheets.Sheet)[0]
  const trigger = () => elements(tree, el => el.type === sheets.SheetTrigger)[0]
  assert.equal(sheet().props.open, false)
  assert.match(trigger().props.render.props.className, /portal-overview-trigger/)
  assert.equal(trigger().props.render.props['aria-label'], 'Open overview. Remaining balance: ₱6,000')
  assert.match(content(trigger()), /Overview/)

  sheet().props.onOpenChange(true)
  tree = render('₱6,400')
  assert.equal(sheet().props.open, true)
  assert.equal(trigger().props.render.props['aria-label'], 'Open overview. Remaining balance: ₱6,400')

  const panel = elements(tree, el => el.type === sheets.SheetContent)[0]
  assert.equal(panel.props.side, 'right')
  assert.ok(panel.props.initialFocus, 'Opening the drawer should focus its title')
  assert.match(content(panel), /Same booking, payment and QR content/)
  assert.match(content(panel), /Project information/)
  assert.match(content(panel), /Overview/)
})

test('PIN and balance are in the final confirmation, never above the review content', () => {
  const source = readFileSync('components/client-photo-selection.tsx', 'utf8')
  assert.ok(source.indexOf('data-testid="submission-balance"') < source.indexOf('id="mobile-submission-pin"'))
  assert.ok(source.indexOf('id="mobile-submission-pin"') < source.indexOf("'Confirm & Submit'"))
  assert.ok(!source.includes('id="submission-pin-help"'))
  assert.match(source, /paymentSummary: \{ packageAmount: number; amountPaid: number \}/)
  assert.match(source, /portalPaymentSummary\(paymentSummary.packageAmount, paymentSummary.amountPaid, addonTotal\)/)
})
