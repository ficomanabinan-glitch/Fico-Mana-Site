export const MAX_RAW_UPLOAD_BYTES = 100 * 1024 * 1024

export class RawUploadError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); this.name = 'RawUploadError' }
}

/** Presigned URLs are bearer capabilities. Never log or persist them, or accept arbitrary upload hosts. */
export function validateRawSessionUrl(value: string) {
  let url: URL
  try { url = new URL(value) } catch {
    throw new RawUploadError('The upload destination could not be verified. Try: refresh this page and retry.')
  }
  if (url.protocol !== 'https:' || url.port || url.username || url.password || url.hash ||
    !url.hostname.endsWith('.r2.cloudflarestorage.com') || !url.searchParams.get('X-Amz-Signature')) {
    throw new RawUploadError('The upload destination could not be verified. Try: refresh this page and retry.')
  }
  return url.href
}
