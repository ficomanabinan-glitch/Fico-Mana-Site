export const MAX_RAW_UPLOAD_BYTES = 100 * 1024 * 1024

export class RawUploadError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); this.name = 'RawUploadError' }
}

/** Session URLs are bearer capabilities. Never log or persist them, or accept arbitrary upload hosts. */
export function validateRawSessionUrl(value: string) {
  let url: URL
  try { url = new URL(value) } catch {
    throw new RawUploadError('The upload destination could not be verified. Try: refresh this page and retry.')
  }
  if (url.protocol !== 'https:' || url.hostname !== 'www.googleapis.com' || url.port || url.username || url.password || url.hash ||
    !/^\/upload\/drive\/v3\/files(?:\/[A-Za-z0-9_-]+)?$/.test(url.pathname) || !url.searchParams.get('upload_id')) {
    throw new RawUploadError('The upload destination could not be verified. Try: refresh this page and retry.')
  }
  return url.href
}
