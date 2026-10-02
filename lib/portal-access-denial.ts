/** A private portal must stop showing cached photos when access is no longer authorized. */
export function isPortalAccessDenied(status: number): boolean {
  return status === 401 || status === 403 || status === 404 || status === 410
}
