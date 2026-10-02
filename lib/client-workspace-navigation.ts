/** Identity is a real client UUID, or an explicitly namespaced legacy booking. */
export function clientWorkspaceHref(bookingId: string, clientId?: string | null) {
  const identity = clientId || `booking:${bookingId}`
  return `/admin/clients/${encodeURIComponent(identity)}?booking=${encodeURIComponent(bookingId)}`
}

/** Cross-workflow links stay local in QA; production uses the established subdomain. */
export function staffWorkflowHref(path: string, origin?: string) {
  if (!path.startsWith('/editor/') && !path.startsWith('/admin/')) return path
  const host = origin ? new URL(origin).hostname : ''
  if (host === 'localhost' || host === '127.0.0.1') return path
  if (host && (host === 'ficomana.com' || host.endsWith('.ficomana.com'))) {
    return `https://${path.startsWith('/editor/') ? 'editor' : 'admin'}.ficomana.com${path}`
  }
  return path
}

export function safeClientWorkspaceReturn(value: string | null): string | null {
  if (!value) return null
  try {
    const url = new URL(value, 'https://admin.ficomana.com')
    if (url.origin !== 'https://admin.ficomana.com' || !/^\/admin\/clients\/(?:[0-9a-f-]{36}|booking(?:%3A|:)FM-(?:\d{6}|W[A-Z0-9-]{1,40}))$/i.test(url.pathname)) return null
    const booking = url.searchParams.get('booking')
    if (booking && !/^FM-(?:\d{6}|W[A-Z0-9-]{1,40})$/i.test(booking)) return null
    return `${url.pathname}${booking ? `?booking=${booking}` : ''}`
  } catch { return null }
}
