export const PORTAL_DEVICE_COOKIE = 'fm_portal_device'

const deviceIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function validPortalDeviceId(value: string | null | undefined): value is string {
  return typeof value === 'string' && deviceIdPattern.test(value)
}

export function portalDeviceId(cookieHeader: string | null): string | null {
  const entry = cookieHeader?.split(';').map(part => part.trim()).find(part => part.startsWith(`${PORTAL_DEVICE_COOKIE}=`))
  const value = entry?.slice(PORTAL_DEVICE_COOKIE.length + 1)
  return validPortalDeviceId(value) ? value.toLowerCase() : null
}
