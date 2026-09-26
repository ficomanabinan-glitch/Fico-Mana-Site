'use client'

import { useEffect, useState } from 'react'
import { DEFAULT_WEBSITE_CONTENT, type WebsiteContent } from '@/lib/website-content'

let cachedContent: WebsiteContent | null = null
let pendingContent: Promise<WebsiteContent> | null = null

async function fetchContent() {
  if (cachedContent) return cachedContent
  if (!pendingContent) {
    pendingContent = fetch('/api/website-content', { cache: 'no-store' })
      .then(async (response) => response.ok ? await response.json() as WebsiteContent : DEFAULT_WEBSITE_CONTENT)
      .then((content) => { cachedContent = content; return content })
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
