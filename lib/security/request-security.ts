import { NextResponse } from 'next/server'
import { isAllowedRequestOrigin } from '@/lib/security/origin'

export { isAllowedRequestOrigin } from '@/lib/security/origin'

export function rejectUntrustedMutation(request: Request) {
  if (isAllowedRequestOrigin(request)) return null
  return NextResponse.json(
    { error: 'Request origin is not allowed.', code: 'ORIGIN_NOT_ALLOWED' },
    {
      status: 403,
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    },
  )
}

export function privateNoStoreHeaders() {
  return {
    'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
    'X-Content-Type-Options': 'nosniff',
  } as const
}
