import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './helpers/load-ts.ts'

const publicId = '00000000-0000-4000-8000-000000000001'

test('portal server read renders the authorized initial payload once, with no browser-only data dependency', async () => {
  let reads = 0, checks = 0, blocked = false
  const Client = () => null, Skeleton = () => null
  const page = loadTs<{ default: (props: { params: Promise<{ id: string }> }) => Promise<any> }>('app/portal/[id]/page.tsx', {
    'next/headers': { headers: async () => new Headers({ 'x-forwarded-for': '192.0.2.1' }) },
    '@/components/client-portal-page': Client, '@/components/portal-page-skeleton': Skeleton,
    '@/lib/security/api-rate-limit': { API_RATE_LIMITS: { portalRead: 'policy' }, enforceApiRateLimit: async (request: Request, policy: string, dimensions: string[]) => {
      checks++; assert.equal(request.headers.get('x-forwarded-for'), '192.0.2.1')
      assert.equal(policy, 'policy'); assert.deepEqual(dimensions, [publicId]); return blocked ? new Response(null, { status: 429 }) : null
    } },
    '@/lib/editor-workflow': { getPortalData: async (id: string, offset: number, limit: number) => {
      reads++; assert.equal(id, publicId); assert.equal(offset, 0); assert.equal(limit, 48)
      return { portalId: publicId, booking: { customerName: 'Synthetic Client' }, gallery: [{ id: 'photo', fileName: 'sample.JPG' }], deliverables: [] }
    } },
  })
  const render = async (id: string) => {
    const shell = await page.default({ params: Promise.resolve({ id }) })
    assert.equal(shell.props.fallback.type, Skeleton)
    const content = shell.props.children
    return content.type(content.props)
  }
  const result = await render(publicId)
  assert.equal(result.type, Client)
  assert.equal(result.props.initialData.booking.customerName, 'Synthetic Client')
  assert.equal(result.props.initialData.gallery[0].previewUrl, `/api/editor-workflow/portal/${publicId}/file/photo?kind=gallery`)
  assert.equal(reads, 1); assert.equal(checks, 1)
  blocked = true
  assert.equal((await render(publicId)).props.initialData, null)
  assert.equal(reads, 1, 'A blocked request does not touch private booking data')
  assert.match((await render('invalid')).props.initialError, /invalid/)
  assert.equal(checks, 2, 'Malformed links do not consume a booking read')
})
