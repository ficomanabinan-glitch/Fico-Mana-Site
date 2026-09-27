import assert from 'node:assert/strict'
import test from 'node:test'
import { NextRequest, NextResponse } from 'next/server.js'
import { publicAnalyticsUrl, isPrivatePagePath, PRIVATE_PAGE_PATHS } from '../lib/public-page-policy.ts'
import * as policy from '../lib/public-page-policy.ts'
import * as hosts from '../lib/auth/admin.ts'
import * as newAdmin from '../lib/new-admin/routing.ts'
import { loadTs } from './helpers/load-ts.ts'

test('analytics accepts only known public pages and strips booking identifiers', () => {
  assert.equal(publicAnalyticsUrl('https://www.ficomana.com/?booking=private-id#resubmit'), 'https://www.ficomana.com/')
  assert.equal(publicAnalyticsUrl('https://ficomana.com/gallery?utm_source=test'), 'https://ficomana.com/gallery')
  for (const url of ['not a url', 'https://admin.ficomana.com/', 'https://editor.ficomana.com/', 'https://www.ficomana.com/portal/secret', 'https://www.ficomana.com/shoot-response/token', 'https://www.ficomana.com/missing-page', 'https://preview.vercel.app/']) {
    assert.equal(publicAnalyticsUrl(url), null, url)
  }
})

test('private path boundaries do not suppress similarly named public pages', () => {
  for (const path of PRIVATE_PAGE_PATHS) {
    assert.equal(isPrivatePagePath(path), true)
    assert.equal(isPrivatePagePath(`${path}/test`), true)
    assert.equal(isPrivatePagePath(`${path}-public`), false)
  }
})

test('staff robots excludes the entire host while public robots retains the canonical sitemap', async () => {
  for (const host of ['admin.ficomana.com', 'editor.ficomana.com', 'newadmin.ficomana.com', 'www.ficomana.com']) {
    const { default: robots } = loadTs<typeof import('../app/robots.ts')>('app/robots.ts', {
      'next/headers': { headers: async () => new Headers({ host }) },
      '@/lib/auth/admin': hosts, '@/lib/new-admin/routing': newAdmin,
      '@/lib/site-metadata': { siteUrl: 'https://www.ficomana.com' }, '@/lib/public-page-policy': policy,
    })
    const result = await robots()
    if (host === 'www.ficomana.com') {
      assert.equal(result.sitemap, 'https://www.ficomana.com/sitemap.xml')
      assert.deepEqual(result.rules, { userAgent: '*', allow: '/', disallow: PRIVATE_PAGE_PATHS })
    } else {
      assert.deepEqual(result.rules, { userAgent: '*', disallow: '/' })
      assert.equal(result.sitemap, undefined)
    }
  }
})

test('noindex response headers cover staff host aliases and private paths, not public pages', async () => {
  const { proxy } = loadTs<typeof import('../proxy.ts')>('proxy.ts', {
    '@/lib/supabase/middleware': { updateSession: async () => NextResponse.next() },
    '@/lib/auth/admin': hosts, '@/lib/new-admin/routing': newAdmin, '@/lib/public-page-policy': policy,
  })
  for (const [host, path, privatePage] of [
    ['admin.ficomana.com', '/', true], ['editor.ficomana.com', '/files', true],
    ['newadmin.ficomana.com', '/', true], ['www.ficomana.com', '/portal/token', true],
    ['www.ficomana.com', '/shoot-response/token', true], ['www.ficomana.com', '/gallery', false],
  ] as const) {
    const result = await proxy(new NextRequest(`https://${host}${path}`, { headers: { host } }))
    assert.equal(Boolean(result.headers.get('x-robots-tag')?.includes('noindex')), privatePage)
  }
})
