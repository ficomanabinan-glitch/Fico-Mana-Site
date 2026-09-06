import { NextResponse } from 'next/server'
import { getPublishedWebsiteMedia } from '@/lib/website-media-server'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(await getPublishedWebsiteMedia(), {
    headers: {
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'CDN-Cache-Control': 'public, max-age=0, must-revalidate',
    },
  })
}
