// Test-process-only preload. This file is not imported by the application.
// HTTP-layer fixtures keep the real Supabase SDK and CMS mapping/rendering.
import { MockAgent, setGlobalDispatcher } from 'undici'
import { DEFAULT_WEBSITE_CONTENT } from '../lib/website-content.ts'

if (process.env.QA_ISOLATED_LOCAL !== 'true') {
  throw new Error('SSR fixtures are restricted to the isolated local QA process.')
}

const workspaceId = '33333333-3333-4333-8333-333333333333'
const content = DEFAULT_WEBSITE_CONTENT
const row = {
  workspace_id: workspaceId,
  website_copy: content.copy,
  studio_name: content.studioName,
  phone_number: content.phoneNumber,
  public_email: content.publicEmail,
  address_line_1: content.addressLine1,
  address_line_2: content.addressLine2,
  map_embed_url: content.mapEmbedUrl,
  map_directions_url: content.mapDirectionsUrl,
  facebook_url: content.facebookUrl,
  instagram_url: content.instagramUrl,
  tiktok_url: content.tiktokUrl,
  business_hours: content.businessHours,
}

const mock = new MockAgent()
mock.disableNetConnect()
// Next may fetch itself for rendering; only loopback is permitted. Supabase's
// two known QA origins are intercepted before this loopback allowance applies.
mock.enableNetConnect(/^(?:127\.0\.0\.1|localhost)(?::\d+)?$/)
for (const origin of ['https://isolated.invalid', 'http://127.0.0.1:54321', 'https://127.0.0.1:54321']) {
  const pool = mock.get(origin)
  pool.intercept({ method: 'GET', path: /^\/rest\/v1\/workspaces\?select=id&slug=eq\.fico-mana&status=eq\.active$/ })
    .reply(200, [{ id: workspaceId }], { headers: { 'content-type': 'application/json' } }).persist()
  pool.intercept({ method: 'GET', path: new RegExp(`^/rest/v1/website_content_settings\\?select=\\*&workspace_id=eq\\.${workspaceId}$`) })
    .reply(200, [row], { headers: { 'content-type': 'application/json' } }).persist()
}
setGlobalDispatcher(mock)
