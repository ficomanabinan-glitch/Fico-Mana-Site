import sharp from 'sharp'

type DetectedImage = 'jpeg' | 'png' | 'gif' | 'webp' | 'tiff' | 'heic' | 'cr2' | 'orf' | 'rw2' | 'raf' | 'unknown'

const RECEIPT_EXTENSIONS: Record<string, DetectedImage> = {
  jpg: 'jpeg',
  jpeg: 'jpeg',
  png: 'png',
  gif: 'gif',
  webp: 'webp',
}

const RECEIPT_MIME: Record<string, DetectedImage> = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
}

function ascii(buffer: Buffer, start: number, end: number) {
  return buffer.subarray(start, end).toString('ascii')
}

export function detectFileSignature(buffer: Buffer): DetectedImage {
  if (buffer.length < 12) return 'unknown'
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg'
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png'
  if (ascii(buffer, 0, 6) === 'GIF87a' || ascii(buffer, 0, 6) === 'GIF89a') return 'gif'
  if (ascii(buffer, 0, 4) === 'RIFF' && ascii(buffer, 8, 12) === 'WEBP') return 'webp'
  if (ascii(buffer, 0, 'FUJIFILMCCD-RAW'.length) === 'FUJIFILMCCD-RAW') return 'raf'
  if (ascii(buffer, 0, 4) === 'IIRO' || ascii(buffer, 0, 4) === 'MMOR') return 'orf'
  if (buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x55 && buffer[3] === 0x00) return 'rw2'
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x49 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x2a &&
    buffer[3] === 0x00 &&
    ascii(buffer, 8, 10) === 'CR'
  ) return 'cr2'
  if (
    (buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2a && buffer[3] === 0x00) ||
    (buffer[0] === 0x4d && buffer[1] === 0x4d && buffer[2] === 0x00 && buffer[3] === 0x2a)
  ) return 'tiff'
  if (ascii(buffer, 4, 8) === 'ftyp') {
    const brand = ascii(buffer, 8, 12).toLowerCase()
    if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1', 'crx '].includes(brand)) return 'heic'
  }
  return 'unknown'
}

function fileExtension(fileName: string) {
  return fileName.split('.').pop()?.toLowerCase() || ''
}

export async function validateReceiptImageContent(buffer: Buffer, mimeType: string, fileName: string) {
  const expectedByExtension = RECEIPT_EXTENSIONS[fileExtension(fileName)]
  const expectedByMime = RECEIPT_MIME[mimeType.toLowerCase()]
  const detected = detectFileSignature(buffer)

  if (!expectedByExtension || !expectedByMime || expectedByExtension !== expectedByMime || detected !== expectedByMime) {
    throw new Error('The receipt file content does not match its image type.')
  }

  try {
    const metadata = await sharp(buffer, { failOn: 'error', limitInputPixels: 40_000_000 }).metadata()
    const decoded = metadata.format
    if (decoded !== expectedByMime || !metadata.width || !metadata.height) throw new Error('invalid image')
    // Metadata alone accepts some truncated files. Decode all accepted frames,
    // with a total pixel bound, without modifying the original upload.
    if (metadata.width * metadata.height * (metadata.pages || 1) > 40_000_000) throw new Error('invalid image')
    await sharp(buffer, { animated: true, failOn: 'error', limitInputPixels: 40_000_000 }).stats()
  } catch {
    throw new Error('The receipt is not a valid decodable image.')
  }

  return detected
}

export async function validateJpegThumbnailContent(buffer: Buffer) {
  if (detectFileSignature(buffer) !== 'jpeg') {
    throw new Error('The thumbnail content is not a JPEG image.')
  }
  try {
    const metadata = await sharp(buffer, { failOn: 'error', limitInputPixels: 16_000_000 }).metadata()
    if (metadata.format !== 'jpeg' || !metadata.width || !metadata.height) throw new Error('invalid thumbnail')
    await sharp(buffer, { failOn: 'error', limitInputPixels: 16_000_000 }).stats()
  } catch {
    throw new Error('The thumbnail is not a valid decodable JPEG image.')
  }
}

const PHOTO_EXTENSION_SIGNATURES: Record<string, ReadonlySet<DetectedImage>> = {
  jpg: new Set(['jpeg']),
  jpeg: new Set(['jpeg']),
  png: new Set(['png']),
  gif: new Set(['gif']),
  webp: new Set(['webp']),
  tif: new Set(['tiff']),
  tiff: new Set(['tiff']),
  heic: new Set(['heic']),
  heif: new Set(['heic']),
  dng: new Set(['tiff']),
  cr2: new Set(['cr2']),
  cr3: new Set(['heic']),
  nef: new Set(['tiff']),
  arw: new Set(['tiff']),
  orf: new Set(['orf', 'tiff']),
  rw2: new Set(['rw2']),
  raf: new Set(['raf']),
}

const EDITED_PHOTO_MIME: Record<string, ReadonlySet<string>> = {
  jpg: new Set(['image/jpeg', 'application/octet-stream']),
  jpeg: new Set(['image/jpeg', 'application/octet-stream']),
  png: new Set(['image/png', 'application/octet-stream']),
  webp: new Set(['image/webp', 'application/octet-stream']),
  tif: new Set(['image/tiff', 'application/octet-stream']),
  tiff: new Set(['image/tiff', 'application/octet-stream']),
  heic: new Set(['image/heic', 'image/heif', 'application/octet-stream']),
  heif: new Set(['image/heic', 'image/heif', 'application/octet-stream']),
}

/**
 * Direct object uploads bypass the application body, so validate the metadata
 * before issuing an upload URL and then verify size/hash after storage accepts it.
 */
export function validateEditedPhotoMetadata(fileName: string, mimeType: string) {
  const extension = fileExtension(fileName)
  const allowedMimeTypes = EDITED_PHOTO_MIME[extension]
  const normalizedMime = mimeType.trim().toLowerCase()
  if (!allowedMimeTypes?.has(normalizedMime)) {
    throw new Error('The edited photo filename and content type do not match an allowed format.')
  }
}

export function validatePhotographyFileContent(buffer: Buffer, fileName: string) {
  const extension = fileExtension(fileName)
  const allowed = PHOTO_EXTENSION_SIGNATURES[extension]
  const detected = detectFileSignature(buffer)
  if (!allowed || !allowed.has(detected)) {
    throw new Error('The uploaded photo content does not match its filename extension.')
  }
  return detected
}
