'use client'

import { useEffect, useState } from 'react'
import { DEFAULT_WEBSITE_MEDIA, mergeWebsiteMedia, type WebsiteMediaSlot } from '@/lib/website-media'

let cachedMedia: WebsiteMediaSlot[] | null = null
let pendingMedia: Promise<WebsiteMediaSlot[]> | null = null

async function fetchWebsiteMedia() {
  if (cachedMedia) return cachedMedia
  if (!pendingMedia) {
    pendingMedia = fetch('/api/website-media', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Website media is unavailable.')
        const media = mergeWebsiteMedia(await response.json())
        cachedMedia = media
        return media
      })
      .catch(() => DEFAULT_WEBSITE_MEDIA.map((slot) => ({ ...slot })))
      .finally(() => {
        pendingMedia = null
      })
  }
  return pendingMedia
}

export function useWebsiteMedia() {
  const [media, setMedia] = useState<WebsiteMediaSlot[]>(() =>
    cachedMedia ?? DEFAULT_WEBSITE_MEDIA.map((slot) => ({ ...slot })),
  )

  useEffect(() => {
    let active = true
    void fetchWebsiteMedia().then((nextMedia) => {
      if (active) setMedia(nextMedia)
    })
    return () => {
      active = false
    }
  }, [])

  return media
}
