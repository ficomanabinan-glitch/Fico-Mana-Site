export type WebsiteContent = {
  studioName: string
  phoneNumber: string
  publicEmail: string
  addressLine1: string
  addressLine2: string
  mapEmbedUrl: string
  mapDirectionsUrl: string
  facebookUrl: string
  instagramUrl: string
  tiktokUrl: string
  businessHours: string
}

export const DEFAULT_WEBSITE_CONTENT: WebsiteContent = {
  studioName: 'FICO MANA',
  phoneNumber: '+63 49 576 5176',
  publicEmail: '',
  addressLine1: 'Cabuyao Retail Plaza',
  addressLine2: '4025 Cabuyao, Laguna',
  mapEmbedUrl: 'https://maps.google.com/maps?q=Cabuyao%20Retail%20Plaza,%20Laguna&t=&z=14&ie=UTF8&iwloc=&output=embed',
  mapDirectionsUrl: 'https://maps.google.com/?q=Cabuyao+Retail+Plaza+Laguna',
  facebookUrl: 'https://www.facebook.com/FICOMANA',
  instagramUrl: 'https://www.instagram.com/ficomanastudio/',
  tiktokUrl: 'https://www.tiktok.com/@ficomanastudio',
  businessHours: '',
}

export function mapWebsiteContent(row: Record<string, unknown> | null | undefined): WebsiteContent {
  if (!row) return { ...DEFAULT_WEBSITE_CONTENT }
  return {
    studioName: String(row.studio_name || DEFAULT_WEBSITE_CONTENT.studioName),
    phoneNumber: String(row.phone_number || DEFAULT_WEBSITE_CONTENT.phoneNumber),
    publicEmail: String(row.public_email || ''),
    addressLine1: String(row.address_line_1 || DEFAULT_WEBSITE_CONTENT.addressLine1),
    addressLine2: String(row.address_line_2 || ''),
    mapEmbedUrl: String(row.map_embed_url || DEFAULT_WEBSITE_CONTENT.mapEmbedUrl),
    mapDirectionsUrl: String(row.map_directions_url || DEFAULT_WEBSITE_CONTENT.mapDirectionsUrl),
    facebookUrl: String(row.facebook_url || ''),
    instagramUrl: String(row.instagram_url || ''),
    tiktokUrl: String(row.tiktok_url || ''),
    businessHours: String(row.business_hours || ''),
  }
}
