import { isIP } from 'node:net'

/** Never accept caller-selected hosts, userinfo, non-TLS schemes, or alternate ports. */
export function requireTrustedHttpsUrl(value: string, allowedHosts: readonly string[]) {
  const url = new URL(value)
  const host = url.hostname.toLowerCase()
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') ||
    isIP(host.replace(/^\[|\]$/g, '')) || !allowedHosts.includes(host)) {
    throw new Error('External resource address is not permitted.')
  }
  return url
}

export async function readBoundedResponse(response: Response, maximumBytes: number) {
  if (!response.body || Number(response.headers.get('content-length') || 0) > maximumBytes) {
    await response.body?.cancel()
    throw new Error('External file exceeds the allowed size.')
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > maximumBytes) { await reader.cancel(); throw new Error('External file exceeds the allowed size.') }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  return Buffer.concat(chunks, length)
}
