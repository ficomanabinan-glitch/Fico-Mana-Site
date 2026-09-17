import { randomUUID } from 'node:crypto'

export const STORAGE_PROVIDER = 'r2' as const

export const STORAGE_CATEGORIES = [
  'raw',
  'original',
  'preview',
  'thumbnail',
  'enhanced',
  'deliverable',
  'print',
  'temporary',
] as const

export type StorageCategory = (typeof STORAGE_CATEGORIES)[number]

const categorySet = new Set<string>(STORAGE_CATEGORIES)
const identifierPattern = /^[A-Za-z0-9_-]{1,200}$/
const extensionPattern = /^[a-z0-9]{1,10}$/

export function createStorageObjectId() {
  return randomUUID()
}

export function fileExtension(fileName: string, fallback = 'bin') {
  const extension = fileName.trim().toLowerCase().match(/\.([a-z0-9]{1,10})$/)?.[1] || fallback
  if (!extensionPattern.test(extension)) throw new Error('The file extension is not supported.')
  return extension === 'jpeg' ? 'jpg' : extension
}

function identifier(value: string, label: string) {
  const normalized = value.trim()
  if (!identifierPattern.test(normalized)) throw new Error(`${label} is invalid.`)
  return normalized
}

function shootParts(value: string) {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) throw new Error('The shoot date must use YYYY-MM-DD.')
  return { year: match[1], month: match[2], day: match[3] }
}

export function bookingStoragePrefix(input: {
  workspaceId: string
  bookingId: string
  shootDate: string
}) {
  const { year, month, day } = shootParts(input.shootDate)
  return [
    'workspaces',
    identifier(input.workspaceId, 'Workspace ID'),
    'shoots',
    year,
    month,
    day,
    identifier(input.bookingId, 'Booking ID'),
  ].join('/')
}

export function createStorageKey(input: {
  workspaceId: string
  bookingId: string
  shootDate: string
  category: StorageCategory
  objectId: string
  fileName: string
}) {
  if (!categorySet.has(input.category)) throw new Error('The storage category is invalid.')
  return `${bookingStoragePrefix(input)}/${input.category}/${identifier(input.objectId, 'Object ID')}.${fileExtension(input.fileName)}`
}

export function createDerivativeKey(sourceKey: string, category: 'preview' | 'thumbnail', extension = 'webp') {
  const parsed = parseStorageKey(sourceKey)
  if (!extensionPattern.test(extension)) throw new Error('The derivative extension is invalid.')
  return `${parsed.bookingPrefix}/${category}/${parsed.objectId}.${extension}`
}

export function parseStorageKey(key: string) {
  if (!key || key.length > 1024 || key.startsWith('/') || key.endsWith('/') || key.includes('\\') || key.includes('//')) {
    throw new Error('The storage key is invalid.')
  }
  const parts = key.split('/')
  if (parts.some((part) => !part || part === '.' || part === '..')) throw new Error('The storage key is invalid.')
  const match = key.match(/^workspaces\/([A-Za-z0-9_-]{1,200})\/shoots\/(\d{4})\/(\d{2})\/(\d{2})\/([A-Za-z0-9_-]{1,200})\/([a-z]+)\/([A-Za-z0-9_-]{1,200})\.([a-z0-9]{1,10})$/)
  if (!match || !categorySet.has(match[6])) throw new Error('The storage key is outside the FICO MANA namespace.')
  return {
    workspaceId: match[1],
    shootDate: `${match[2]}-${match[3]}-${match[4]}`,
    bookingId: match[5],
    category: match[6] as StorageCategory,
    objectId: match[7],
    extension: match[8],
    bookingPrefix: parts.slice(0, 7).join('/'),
  }
}

export function assertStorageKeyOwnership(key: string, workspaceId: string, bookingId?: string) {
  const parsed = parseStorageKey(key)
  if (parsed.workspaceId !== workspaceId || (bookingId && parsed.bookingId !== bookingId)) {
    throw new Error('The file does not belong to this booking.')
  }
  return parsed
}
