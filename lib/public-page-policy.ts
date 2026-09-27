// Explicitly allow public marketing pages only. Never collect bearer links,
// booking query strings, private workspace routes, or unknown/404 URLs.
export const PUBLIC_PAGE_PATHS = ['/', '/gallery', '/packages', '/privacy', '/terms'] as const
export const PRIVATE_PAGE_PATHS = ['/admin', '/newadmin', '/editor', '/filtering', '/api', '/auth', '/portal', '/shoot-response', '/submit-raw-photo', '/local-preview']

export function isPrivatePagePath(pathname: string) {
  return PRIVATE_PAGE_PATHS.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

export function publicAnalyticsUrl(raw: string): string | null {
  try {
    const url = new URL(raw)
    if (!['www.ficomana.com', 'ficomana.com'].includes(url.hostname) ||
        !PUBLIC_PAGE_PATHS.some(path => path === url.pathname)) return null
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch { return null }
}
