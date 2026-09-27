import { z } from 'zod'
import { WEBSITE_COPY_FIELDS } from './website-copy.ts'

const httpsUrl = z.string().trim().url().max(500).refine((value) => new URL(value).protocol === 'https:', 'Use a secure HTTPS address.')
const optionalHttpsUrl = z.union([z.literal(''), httpsUrl])
export const contentSchema = z.object({
  copy: z.object(Object.fromEntries(WEBSITE_COPY_FIELDS.map(field => [field.key,
    z.string().trim().min(1, `${field.label} is required.`).max(field.maxLength),
  ]))).strict().optional(),
  studioName: z.string().trim().min(1).max(80),
  phoneNumber: z.string().trim().min(7).max(40),
  publicEmail: z.union([z.literal(''), z.string().trim().email().max(160)]),
  addressLine1: z.string().trim().min(1).max(160),
  addressLine2: z.string().trim().max(160),
  mapEmbedUrl: httpsUrl.refine((value) => ['www.google.com', 'maps.google.com'].includes(new URL(value).hostname), 'Use a Google Maps embed link from www.google.com or maps.google.com.'),
  mapDirectionsUrl: httpsUrl,
  facebookUrl: optionalHttpsUrl,
  instagramUrl: optionalHttpsUrl,
  tiktokUrl: optionalHttpsUrl,
  businessHours: z.string().trim().max(200),
}).strict()
