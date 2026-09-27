import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { DEFAULT_WEBSITE_CONTENT, mapWebsiteContent } from '../lib/website-content.ts'
import { DEFAULT_WEBSITE_COPY, WEBSITE_COPY_FIELDS, mapWebsiteCopy } from '../lib/website-copy.ts'
import { contentSchema } from '../lib/website-content-validation.ts'

test('old CMS rows retain existing wording and contact values when editorial columns are absent', () => {
  const content = mapWebsiteContent({ studio_name: 'Studio name', phone_number: '+639001234567' })
  assert.equal(content.studioName, 'Studio name')
  assert.equal(content.phoneNumber, '+639001234567')
  assert.deepEqual(content.copy, DEFAULT_WEBSITE_COPY)
  assert.match(content.copy.termsBody, /non-refundable deposit/)
})

test('content mapper whitelists plain text, fills missing values and bounds long content', () => {
  const result = mapWebsiteCopy({ privacyBody: '<script>not executable</script>\n\nSecond paragraph', heroTitle: 'X'.repeat(2000), termsTitle: ' ', updated_by: 'private' })
  assert.equal(result.privacyBody, '<script>not executable</script>\n\nSecond paragraph')
  assert.equal(result.heroTitle.length, 500)
  assert.equal(result.termsTitle, DEFAULT_WEBSITE_COPY.termsTitle)
  assert.equal('updated_by' in result, false)
  assert.deepEqual(mapWebsiteCopy(null), DEFAULT_WEBSITE_COPY)
  assert.deepEqual(mapWebsiteCopy([]), DEFAULT_WEBSITE_COPY)
  assert.equal(new Set(WEBSITE_COPY_FIELDS.map(field => field.key)).size, WEBSITE_COPY_FIELDS.length)
})

test('CMS validation accepts current data and rejects incomplete copy and unsafe links', () => {
  assert.equal(contentSchema.safeParse(DEFAULT_WEBSITE_CONTENT).success, true)
  const { copy: _copy, ...legacy } = DEFAULT_WEBSITE_CONTENT
  assert.equal(Object.keys(_copy).length, WEBSITE_COPY_FIELDS.length)
  assert.equal(contentSchema.safeParse(legacy).success, true)
  for (const copy of [{}, { ...DEFAULT_WEBSITE_COPY, privacyBody: '' }, { ...DEFAULT_WEBSITE_COPY, termsBody: 'x'.repeat(20001) }, { ...DEFAULT_WEBSITE_COPY, unknown: 'data' }]) {
    assert.equal(contentSchema.safeParse({ ...legacy, copy }).success, false)
  }
  for (const mapEmbedUrl of ['javascript:alert(1)', 'https://example.com/maps', 'https://www.google.com.evil.example/embed']) {
    assert.equal(contentSchema.safeParse({ ...DEFAULT_WEBSITE_CONTENT, mapEmbedUrl }).success, false)
  }
})

test('editorial migration preserves rows and blocks public writes and invalid JSON', async (t) => {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key);
    create table public.workspaces(id uuid primary key, slug text);
    insert into public.workspaces values ('00000000-0000-0000-0000-000000000001','fico-mana');
  `)
  await db.exec(await readFile('supabase/migrations/20260926175903_website_content_management.sql', 'utf8'))
  await db.exec("update website_content_settings set studio_name='Existing studio'")
  await db.exec(await readFile('supabase/migrations/20260927150452_website_editorial_and_legal_content.sql', 'utf8'))
  const result = await db.query<{ studio_name: string; website_copy: object }>('select studio_name, website_copy from website_content_settings')
  assert.deepEqual(result.rows, [{ studio_name: 'Existing studio', website_copy: {} }])
  await db.query('update website_content_settings set website_copy = $1::jsonb', [JSON.stringify({ privacyBody: 'First\n\nSecond' })])
  assert.deepEqual((await db.query('select website_copy from website_content_settings')).rows, [{ website_copy: { privacyBody: 'First\n\nSecond' } }])
  await assert.rejects(db.exec("update website_content_settings set website_copy='[]'::jsonb"), /website_content_copy_object/)
  await db.exec('set role anon')
  await assert.rejects(db.exec('select * from website_content_settings'), /permission denied/)
  await db.exec('reset role')
  await db.exec('set role authenticated')
  await assert.rejects(db.exec("update website_content_settings set studio_name='Changed'"), /permission denied/)
})
