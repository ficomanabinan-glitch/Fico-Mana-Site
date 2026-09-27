import { NextResponse } from 'next/server'
import { getPublishedWebsiteContent } from '@/lib/website-content-server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    return NextResponse.json(await getPublishedWebsiteContent(), {
      headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=60' },
    })
  } catch {
    return NextResponse.json({ error: 'Website content is temporarily unavailable.' }, {
      status: 503, headers: { 'Cache-Control': 'no-store' },
    })
  }
}
