export type NewAdminTheme = 'light' | 'dark'

export const NEW_ADMIN_THEME_COOKIE = 'fico-newadmin-theme'

export function resolveNewAdminTheme(value?: string | null): NewAdminTheme {
  return value === 'dark' ? 'dark' : 'light'
}

export function newAdminThemeCookie(theme: NewAdminTheme, secure: boolean): string {
  return `${NEW_ADMIN_THEME_COOKIE}=${resolveNewAdminTheme(theme)}; Path=/newadmin; Max-Age=31536000; SameSite=Lax${secure ? '; Secure' : ''}`
}
