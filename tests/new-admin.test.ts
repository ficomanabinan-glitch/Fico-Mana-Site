import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { newAdminAlias, isNewAdminHost } from '../lib/new-admin/routing.ts'
import { NEW_ADMIN_THEME_COOKIE, newAdminThemeCookie, resolveNewAdminTheme } from '../lib/new-admin/theme.ts'
import { loadTs } from './helpers/load-ts.ts'

const source = (path: string) => readFileSync(path,'utf8')

test('new admin aliases are exact-host-only and never redirect the original consoles', () => {
  for (const host of ['admin.ficomana.com','editor.ficomana.com','www.ficomana.com','newadmin.ficomana.com.attacker.test']) {
    assert.equal(newAdminAlias(host,'/'),null)
    assert.equal(newAdminAlias(host,'/admin/dashboard'),null)
  }
  assert.equal(isNewAdminHost('newadmin.ficomana.com:443'),true)
  assert.equal(newAdminAlias('newadmin.ficomana.com','/'),'/newadmin')
  assert.equal(newAdminAlias('newadmin.ficomana.com','/admin/dashboard'),'/newadmin')
  assert.equal(newAdminAlias('newadmin.ficomana.com','/bookings'),'/newadmin/bookings')
  for (const path of ['/admin','/admin/mfa','/api/bookings','/auth/callback','/_next/static/a.js','/newadmin','/newadmin/bookings']) assert.equal(newAdminAlias('newadmin.ficomana.com',path),null)
})

test('the new console requires canonical administrator access and AAL2, reusing existing auth and APIs', () => {
  const layout = source('app/newadmin/layout.tsx')
  assert.match(layout,/await getAdminAuthContext\(\)/)
  assert.match(layout,/if \(!user\) return/)
  assert.match(layout,/assurance\?\.currentLevel !== 'aal2'/)
  assert.match(layout,/redirect\('\/admin\/mfa'\)/)
  assert.match(source('lib/supabase/middleware.ts'),/pathname === '\/newadmin'/)
  assert.match(source('proxy.ts'),/pathname.startsWith\('\/newadmin'\)/)
  assert.match(source('lib/security/origin.ts'),/'https:\/\/newadmin.ficomana.com'/)
  const provider = source('components/new-admin/data-provider.tsx')
  assert.match(provider,/Promise.allSettled/)
  assert.match(provider,/credentials: 'include'/)
  assert.match(provider,/denied \? emptyConsoleData/)
  assert.doesNotMatch(provider,/localStorage|sessionStorage|service_role|SUPABASE_SECRET/)
})

function luminance(hex: string) {
  const rgb = [1,3,5].map(start => parseInt(hex.slice(start,start+2),16)/255).map(c => c <= .04045 ? c/12.92 : ((c+.055)/1.055)**2.4)
  return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722
}
function contrast(a: string,b: string) { const first = luminance(a), second = luminance(b); return (Math.max(first,second)+.05)/(Math.min(first,second)+.05) }
for (const theme of ['light', 'dark']) test(`${theme} semantic color pairs meet WCAG AA including muted, status, focus and chart states`, () => {
  const css = source('components/new-admin/new-admin.module.css')
  const block = css.match(theme === 'dark' ? /\.theme\[data-theme=dark\] \{([^}]+)\}/ : /\.theme \{([^}]+)\}/)?.[1] ?? ''
  const colors = Object.fromEntries([...block.matchAll(/--([a-z-]+): (#[a-f0-9]{6});/g)].map(match => [match[1],match[2]]))
  for (const [text,background] of [['foreground','background'],['card-foreground','card'],['muted-foreground','muted'],['primary-foreground','primary'],['secondary-foreground','secondary'],['accent-foreground','accent'],['destructive-foreground','destructive'],['success','success-foreground'],['warning','warning-foreground'],['info','info-foreground']]) assert.ok(contrast(colors[text],colors[background]) >= 4.5,`${text}/${background}`)
  for (const color of ['border','input','ring','revenue','expenses','profit']) for (const background of ['card','background']) assert.ok(contrast(colors[color],colors[background]) >= 3,`${color}/${background}`)
  for (const [text,background] of [['primary-foreground','primary-hover'],['destructive','error-surface'],['muted-foreground','table-heading'],['foreground','row-hover'],['popover-foreground','popover']]) assert.ok(contrast(colors[text],colors[background]) >= 4.5,`${text}/${background}`)
  assert.match(css,/--leading-golden: 1\.6;/)
  for (const size of [12,14,16,20,26,42]) assert.match(css,new RegExp(`--text-[a-z]+: ${size}px`))
  assert.match(css,/:focus-visible/)
  assert.match(css,/prefers-reduced-motion/)
  assert.doesNotMatch(css,/:root|:global|^body\s*\{|^html\s*\{/m)
})

test('new admin appearance preference is validated and scoped without changing auth cookies', () => {
  assert.equal(resolveNewAdminTheme(), 'light')
  assert.equal(resolveNewAdminTheme('light'), 'light')
  assert.equal(resolveNewAdminTheme('dark'), 'dark')
  for (const input of ['system', 'DARK', 'dark; Domain=.ficomana.com', '<script>']) assert.equal(resolveNewAdminTheme(input), 'light')
  assert.equal(newAdminThemeCookie('dark',true), `${NEW_ADMIN_THEME_COOKIE}=dark; Path=/newadmin; Max-Age=31536000; SameSite=Lax; Secure`)
  assert.equal(newAdminThemeCookie('light',false), `${NEW_ADMIN_THEME_COOKIE}=light; Path=/newadmin; Max-Age=31536000; SameSite=Lax`)
  assert.doesNotMatch(newAdminThemeCookie('dark',true), /Domain=|sb-|token|session|SameSite=None/)
})

test('theme is server-initialized and reused by the mobile portal without refetching studio records', () => {
  const layout = source('app/newadmin/layout.tsx')
  const provider = source('components/new-admin/theme-provider.tsx')
  const shell = source('components/new-admin/shell.tsx')
  assert.match(layout, /resolveNewAdminTheme\(\(await cookies\(\)\)\.get\(NEW_ADMIN_THEME_COOKIE\)\?\.value\)/)
  assert.match(layout, /NewAdminThemeProvider initialTheme=\{theme\}/)
  assert.match(provider, /useState\(initialTheme\)/)
  assert.match(provider, /data-theme=\{theme\}/)
  assert.match(provider, /Switch to light mode/)
  assert.match(provider, /Switch to dark mode/)
  assert.match(provider, /aria-pressed=\{theme === 'dark'\}/)
  assert.match(shell, /SheetContent side="left" data-theme=\{theme\}/)
  assert.match(shell, /<ThemeToggle \/>/)
  assert.doesNotMatch(provider, /fetch\(|router\.|location\.reload|documentElement|classList|localStorage|supabase/)
})

test('presentation examples stay synthetic and grouping preserves whole-week/month keys', () => {
  const finance = loadTs<typeof import('../lib/sales-finance.ts')>('lib/sales-finance.ts',{})
  const model = loadTs<typeof import('../lib/new-admin/presentation-data.ts')>('lib/new-admin/presentation-data.ts', { '@/lib/sales-finance': finance })
  const example = model.sampleConsoleData('2026-09-07')
  assert.equal(example.bookings.length,8)
  assert.ok(example.bookings.every(b => b.id.startsWith('SAMPLE-') && b.customerName.startsWith('Sample Student') && !b.customerEmail && !b.customerPhone))
  assert.ok(example.batches.every(b => !b.driveDayFolderUrl))
  assert.equal(model.periodKey('2026-09-06','week'),'2026-08-31')
  assert.equal(model.periodKey('2026-09-07','week'),'2026-09-07')
  assert.equal(model.periodKey('2026-09-07','month'),'2026-09')
  assert.equal(model.safeDriveUrl('https://drive.google.com.attacker.test/drive/folders/a'),null)
  assert.equal(model.safeDriveUrl('https://name:password@drive.google.com/drive/folders/a'),null)
  assert.equal(model.safeDriveUrl('https://drive.google.com/drive/folders/a'),'https://drive.google.com/drive/folders/a')
  const pages = source('components/new-admin/pages.tsx')
  assert.match(pages,/collections\/download\?scope=/)
  assert.match(pages,/TOGA PICTURE/)
  assert.doesNotMatch(pages,/ROGA|Editor assigned|assignedEditor/)
  assert.match(pages,/!sample &&/)
})

test('financial selection is sticky and defaults to the latest available date', () => {
  const chart = source('components/new-admin/financial-chart.tsx')
  assert.match(chart,/points.find\(point => point.key === selectedKey\) \?\? points.at\(-1\)/)
  assert.match(chart,/slice\(-7\)/)
  assert.match(chart,/aria-pressed/)
  assert.match(chart,/onClick=\{\(\) => setSelectedKey\(point.key\)\}/)
})
