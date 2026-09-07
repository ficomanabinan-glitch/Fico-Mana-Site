export type UploadScanPurpose = 'payment-receipt' | 'raw-photo'
export type UploadScanResult = { status: 'clean' | 'rejected' | 'not_configured'; reason?: string }

type ScanResponse = { verdict?: 'clean' | 'infected' | 'suspicious'; reason?: string }

/**
 * Optional quarantine/scanner adapter. When configured, bytes are sent to a
 * private HTTPS scanning service before they are promoted to trusted storage.
 * Without a provider, signature/decoder validation still runs but this helper
 * truthfully reports that malware scanning is not configured.
 */
export async function scanUpload(input: {
  buffer: Buffer
  fileName: string
  mimeType: string
  purpose: UploadScanPurpose
}): Promise<UploadScanResult> {
  const endpoint = process.env.MALWARE_SCANNER_URL?.trim()
  const token = process.env.MALWARE_SCANNER_TOKEN?.trim()
  if (!endpoint || !token) return { status: 'not_configured' }

  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    throw new Error('Upload security scanner is misconfigured.')
  }
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
    throw new Error('Upload security scanner is misconfigured.')
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
      'X-Upload-Purpose': input.purpose,
      'X-Upload-Mime': input.mimeType.slice(0, 200),
      'X-Upload-Name': encodeURIComponent(input.fileName.slice(0, 200)),
    },
    body: new Uint8Array(input.buffer),
    signal: AbortSignal.timeout(30_000),
    redirect: 'error',
    cache: 'no-store',
  })
  if (!response.ok) throw new Error('Upload security scanning is temporarily unavailable.')
  const result = (await response.json().catch(() => ({}))) as ScanResponse
  if (result.verdict === 'clean') return { status: 'clean' }
  if (result.verdict === 'infected' || result.verdict === 'suspicious') {
    return { status: 'rejected', reason: 'The file was rejected by security scanning.' }
  }
  throw new Error('Upload security scanning returned an invalid result.')
}
