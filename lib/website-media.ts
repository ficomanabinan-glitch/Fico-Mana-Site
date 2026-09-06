export const WEBSITE_MEDIA_BUCKET = 'website-media'

export const WEBSITE_MEDIA_SLOT_KEYS = [
  'gallery_1',
  'gallery_2',
  'gallery_3',
  'gallery_4',
  'gallery_5',
  'featured_video',
] as const

export type WebsiteMediaSlotKey = (typeof WEBSITE_MEDIA_SLOT_KEYS)[number]
export type WebsiteMediaKind = 'image' | 'video'

export type WebsiteMediaSlot = {
  slotKey: WebsiteMediaSlotKey
  kind: WebsiteMediaKind
  label: string
  url: string
  altText: string
  fileName: string
  mimeType: string
  fileSize: number | null
  updatedAt: string | null
  isCustom: boolean
}

export const DEFAULT_WEBSITE_MEDIA: readonly WebsiteMediaSlot[] = [
  {
    slotKey: 'gallery_1',
    kind: 'image',
    label: 'Gallery Photo 1',
    url: '/grad/grad_3.jpg',
    altText: 'Graduation portrait in toga',
    fileName: 'grad_3.jpg',
    mimeType: 'image/jpeg',
    fileSize: null,
    updatedAt: null,
    isCustom: false,
  },
  {
    slotKey: 'gallery_2',
    kind: 'image',
    label: 'Gallery Photo 2',
    url: '/grad/grad_1.jpg',
    altText: 'Graduation portrait with toga and cap',
    fileName: 'grad_1.jpg',
    mimeType: 'image/jpeg',
    fileSize: null,
    updatedAt: null,
    isCustom: false,
  },
  {
    slotKey: 'gallery_3',
    kind: 'image',
    label: 'Gallery Photo 3',
    url: '/grad/grad_8.jpg',
    altText: 'Graduation studio portrait with cap',
    fileName: 'grad_8.jpg',
    mimeType: 'image/jpeg',
    fileSize: null,
    updatedAt: null,
    isCustom: false,
  },
  {
    slotKey: 'gallery_4',
    kind: 'image',
    label: 'Gallery Photo 4',
    url: '/grad/grad_4.jpg',
    altText: 'Graduation toga portrait',
    fileName: 'grad_4.jpg',
    mimeType: 'image/jpeg',
    fileSize: null,
    updatedAt: null,
    isCustom: false,
  },
  {
    slotKey: 'gallery_5',
    kind: 'image',
    label: 'Gallery Photo 5',
    url: '/grad/grad_5.jpg',
    altText: 'Graduation glamour portrait',
    fileName: 'grad_5.jpg',
    mimeType: 'image/jpeg',
    fileSize: null,
    updatedAt: null,
    isCustom: false,
  },
  {
    slotKey: 'featured_video',
    kind: 'video',
    label: 'Featured Video',
    url: '/breanna-reel.mp4',
    altText: 'FICO MANA graduation shoot reel',
    fileName: 'breanna-reel.mp4',
    mimeType: 'video/mp4',
    fileSize: null,
    updatedAt: null,
    isCustom: false,
  },
] as const

const VALID_SLOT_KEYS = new Set<string>(WEBSITE_MEDIA_SLOT_KEYS)

export function isWebsiteMediaSlotKey(value: string): value is WebsiteMediaSlotKey {
  return VALID_SLOT_KEYS.has(value)
}

export function expectedWebsiteMediaKind(slotKey: WebsiteMediaSlotKey): WebsiteMediaKind {
  return slotKey === 'featured_video' ? 'video' : 'image'
}

export function mergeWebsiteMedia(value: unknown): WebsiteMediaSlot[] {
  const defaults = DEFAULT_WEBSITE_MEDIA.map((slot) => ({ ...slot }))
  if (!Array.isArray(value)) return defaults

  const received = new Map<string, Record<string, unknown>>()
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    if (typeof row.slotKey === 'string' && isWebsiteMediaSlotKey(row.slotKey)) {
      received.set(row.slotKey, row)
    }
  }

  return defaults.map((fallback) => {
    const row = received.get(fallback.slotKey)
    if (!row) return fallback
    const url = typeof row.url === 'string' && (/^https:\/\//.test(row.url) || row.url.startsWith('/'))
      ? row.url
      : fallback.url
    return {
      ...fallback,
      url,
      altText: typeof row.altText === 'string' && row.altText.trim() ? row.altText.trim() : fallback.altText,
      fileName: typeof row.fileName === 'string' && row.fileName.trim() ? row.fileName : fallback.fileName,
      mimeType: typeof row.mimeType === 'string' && row.mimeType.trim() ? row.mimeType : fallback.mimeType,
      fileSize: typeof row.fileSize === 'number' && Number.isFinite(row.fileSize) ? row.fileSize : null,
      updatedAt: typeof row.updatedAt === 'string' && row.updatedAt ? row.updatedAt : null,
      isCustom: row.isCustom === true,
    }
  })
}
