const MAX_GALLERY_EDGE = 2560
const WEBP_QUALITY = 0.84
const TARGET_ASPECT_RATIO = 4 / 5

type DecodedImage = {
  source: CanvasImageSource
  width: number
  height: number
  dispose: () => void
}

async function decodeImage(file: File): Promise<DecodedImage> {
  if ('createImageBitmap' in window) {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      dispose: () => bitmap.close(),
    }
  }

  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('The selected image could not be decoded.'))
      element.src = objectUrl
    })
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      dispose: () => URL.revokeObjectURL(objectUrl),
    }
  } catch (error) {
    URL.revokeObjectURL(objectUrl)
    throw error
  }
}

function webpFileName(name: string) {
  const base = name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return `${base || 'gallery-photo'}.webp`
}

/** Resize and encode a gallery upload before any bytes leave the browser. */
export async function optimizeWebsiteGalleryImage(file: File): Promise<File> {
  const decoded = await decodeImage(file)
  try {
    if (!decoded.width || !decoded.height) throw new Error('The selected image has invalid dimensions.')
    const sourceAspectRatio = decoded.width / decoded.height
    const cropWidth = sourceAspectRatio > TARGET_ASPECT_RATIO
      ? decoded.height * TARGET_ASPECT_RATIO
      : decoded.width
    const cropHeight = sourceAspectRatio > TARGET_ASPECT_RATIO
      ? decoded.height
      : decoded.width / TARGET_ASPECT_RATIO
    const cropX = (decoded.width - cropWidth) / 2
    const cropY = (decoded.height - cropHeight) / 2
    const scale = Math.min(1, MAX_GALLERY_EDGE / Math.max(cropWidth, cropHeight))
    const width = Math.max(1, Math.round(cropWidth * scale))
    const height = Math.max(1, Math.round(width / TARGET_ASPECT_RATIO))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { alpha: true })
    if (!context) throw new Error('Image optimization is unavailable in this browser.')
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(decoded.source, cropX, cropY, cropWidth, cropHeight, 0, 0, width, height)

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => result ? resolve(result) : reject(new Error('The image could not be converted to WebP.')),
        'image/webp',
        WEBP_QUALITY,
      )
    })
    return new File([blob], webpFileName(file.name), {
      type: 'image/webp',
      lastModified: Date.now(),
    })
  } finally {
    decoded.dispose()
  }
}
