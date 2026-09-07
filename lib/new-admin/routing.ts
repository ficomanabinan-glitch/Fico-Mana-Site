export const NEW_ADMIN_HOST = 'newadmin.ficomana.com'

export function isNewAdminHost(host: string | null | undefined) {
  return [NEW_ADMIN_HOST, 'newadmin.localhost'].includes((host ?? '').split(':')[0].toLowerCase())
}

/** Only the new hostname gets new aliases; existing admin/editor URLs are unchanged. */
export function newAdminAlias(host: string | null, pathname: string) {
  if (!isNewAdminHost(host)) return null
  if (pathname === '/' || pathname === '/admin/dashboard') return '/newadmin'
  if (pathname === '/admin' || pathname === '/admin/mfa' ||
      /^\/(newadmin|api|auth|_next)(\/|$)/.test(pathname) || /\.[a-z0-9]{1,8}$/i.test(pathname)) return null
  return `/newadmin${pathname}`
}

export const newAdminSections = {
  dashboard: { title: 'Studio overview', description: 'Your bookings, production work and payments at a glance.' },
  bookings: { title: 'Bookings', description: 'Find a client, review their shoot and follow their progress.' },
  filtering: { title: 'Filtering queue', description: 'Review incoming photo selections and prepare the next batch.' },
  editor: { title: 'Editing queue', description: 'See which batches are waiting, downloaded or delivered.' },
  selections: { title: 'Photo selections', description: 'Review enhancement choices, free prints and add-ons.' },
  payments: { title: 'Payments', description: 'Track verified collections and outstanding balances.' },
  drive: { title: 'Google Drive', description: 'Check client folders and the studio connection.' },
  reports: { title: 'Reports', description: 'Review sales and operating expenses for the month.' },
  settings: { title: 'Studio settings', description: 'View package rules and open the existing management tools.' },
} as const
export type NewAdminSection = keyof typeof newAdminSections
