'use client'

import { useEffect, useState } from 'react'
import { DEFAULT_WEBSITE_CONTENT, type WebsiteContent } from '@/lib/website-content'

let cachedContent: WebsiteContent | null = null
let cachedAt = 0
let pendingContent: Promise<WebsiteContent> | null = null

async function fetchContent() {
  if (cachedContent && Date.now() - cachedAt < 60_000) return cachedContent
  if (!pendingContent) {
    pendingContent = fetch('/api/website-content', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Content unavailable')
        const body = await response.json() as WebsiteContent
        return { ...DEFAULT_WEBSITE_CONTENT, ...body, copy: { ...DEFAULT_WEBSITE_CONTENT.copy, ...body.copy } }
      })
      .then((content) => { cachedContent = content; cachedAt = Date.now(); return content })
      .catch(() => cachedContent ?? DEFAULT_WEBSITE_CONTENT)
      .finally(() => { pendingContent = null })
  }
  return pendingContent
}

export function useWebsiteContent() {
  const [content, setContent] = useState<WebsiteContent>(() => cachedContent ?? DEFAULT_WEBSITE_CONTENT)
  useEffect(() => {
    let active = true
    void fetchContent().then((next) => { if (active) setContent(next) })
    return () => { active = false }
  }, [])
  return content
}
