import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { privateNoStoreHeaders } from '@/lib/security/request-security'

/** Return diagnostics locally, but never expose backend exception details in production. */
export function secureErrorResponse(
  error: unknown,
  fallback: string,
  options: { request?: Request; status?: number; context?: string } = {},
) {
  const requestId = options.request?.headers.get('x-request-id') || randomUUID()
  const diagnostic = error instanceof Error ? error : new Error('Non-error exception')
  console.error(`[${requestId}] ${options.context || fallback}:`, diagnostic)
  const clientMessage = process.env.NODE_ENV === 'production'
    ? fallback
    : error instanceof Error
      ? error.message
      : fallback
  return NextResponse.json(
    { error: clientMessage, requestId },
    { status: options.status || 500, headers: privateNoStoreHeaders() },
  )
}

export function secureErrorMessage(error: unknown, fallback: string) {
  return process.env.NODE_ENV === 'production' || !(error instanceof Error)
    ? fallback
    : error.message
}
