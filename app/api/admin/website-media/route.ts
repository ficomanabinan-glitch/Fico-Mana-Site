import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireStaffAuth } from '@/lib/auth-api'
import { canUseWorkflow, getWorkflowAccess } from '@/lib/auth/workflow'
import { API_RATE_LIMITS, enforceApiRateLimit } from '@/lib/security/api-rate-limit'
import { secureErrorResponse } from '@/lib/security/error-response'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { getSupabaseUrl } from '@/lib/supabase/env'
import {
  WEBSITE_MEDIA_BUCKET,
  expectedWebsiteMediaKind,
  type WebsiteMediaKind,
} from '@/lib/website-media'
import { getWebsiteMediaForWorkspace } from '@/lib/website-media-server'

const noStoreHeaders = { 'Cache-Control': 'private, no-store, max-age=0' }
const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] as const
const VIDEO_MIME_TYPES = ['video/mp4', 'video/webm'] as const
const IMAGE_MAX_BYTES = 15 * 1024 * 1024
const VIDEO_MAX_BYTES = 250 * 1024 * 1024
const UPLOAD_GRANT_LIFETIME_MS = 2 * 60 * 60 * 1000

const slotKeySchema = z.enum([
  'gallery_1',
  'gallery_2',
  'gallery_3',
  'gallery_4',
  'gallery_5',
  'featured_video',
])
const mimeTypeSchema = z.enum([...IMAGE_MIME_TYPES, ...VIDEO_MIME_TYPES])
const uploadSessionSchema = z.object({
  action: z.literal('create_upload'),
  slotKey: slotKeySchema,
  fileName: z.string().trim().min(1).max(180),
  mimeType: mimeTypeSchema,
  fileSize: z.number().int().positive().max(VIDEO_MAX_BYTES),
}).strict()
const finalizeSchema = z.object({
  action: z.literal('finalize_upload'),
  slotKey: slotKeySchema,
  path: z.string().trim().min(10).max(500),
  fileName: z.string().trim().min(1).max(180),
  mimeType: mimeTypeSchema,
  fileSize: z.number().int().positive().max(VIDEO_MAX_BYTES),
  altText: z.string().trim().min(3).max(180),
}).strict()
const descriptionSchema = z.object({
  slotKey: slotKeySchema,
  altText: z.string().trim().min(3).max(180),
}).strict()

function maximumSize(kind: WebsiteMediaKind) {
  return kind === 'image' ? IMAGE_MAX_BYTES : VIDEO_MAX_BYTES
}

function isAllowedForKind(kind: WebsiteMediaKind, mimeType: string) {
  return kind === 'image'
    ? IMAGE_MIME_TYPES.includes(mimeType as (typeof IMAGE_MIME_TYPES)[number])
    : VIDEO_MIME_TYPES.includes(mimeType as (typeof VIDEO_MIME_TYPES)[number])
}

function storageExtension(mimeType: string) {
  return ({
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/avif': 'avif',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
  } as Record<string, string>)[mimeType]
}

function resumableUploadEndpoint() {
  const configured = new URL(getSupabaseUrl())
  const projectRef = configured.hostname.endsWith('.supabase.co')
    ? configured.hostname.split('.')[0]
    : null
  return projectRef
    ? `https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable`
    : new URL('/storage/v1/upload/resumable', configured).toString()
}

async function authorize(request?: Request) {
  const auth = await requireStaffAuth(request)
  if (auth.error || !auth.user) return { error: auth.error, user: null, access: null }
  const access = await getWorkflowAccess(auth.user)
  if (!access || !canUseWorkflow(access, 'admin')) {
    return {
      error: NextResponse.json({ error: 'Administrator access is required.' }, { status: 403, headers: noStoreHeaders }),
      user: auth.user,
      access: null,
    }
  }
  return { error: null, user: auth.user, access }
}

function fileValidationError(kind: WebsiteMediaKind, mimeType: string, fileSize: number) {
  if (!isAllowedForKind(kind, mimeType)) {
    return kind === 'image'
      ? 'Choose a JPG, PNG, WebP, or AVIF image.'
      : 'Choose an MP4 or WebM video.'
  }
  if (fileSize > maximumSize(kind)) {
    return kind === 'image'
      ? 'Gallery photos must be 15 MB or smaller.'
      : 'The featured video must be 250 MB or smaller.'
  }
  return null
}

function objectMetadata(file: { metadata?: Record<string, unknown> | null }) {
  const metadata = file.metadata ?? {}
  return {
    size: Number(metadata.size ?? 0),
    mimeType: String(metadata.mimetype ?? metadata.contentType ?? metadata['content-type'] ?? '').toLowerCase(),
  }
}

export async function GET() {
  const auth = await authorize()
  if (auth.error || !auth.access) return auth.error
  try {
    return NextResponse.json(await getWebsiteMediaForWorkspace(auth.access.workspaceId), {
      headers: noStoreHeaders,
    })
  } catch (error) {
    return secureErrorResponse(error, 'Failed to load website media.', {
      context: 'GET /api/admin/website-media',
    })
  }
}

export async function POST(request: Request) {
  const auth = await authorize(request)
  if (auth.error || !auth.access || !auth.user) return auth.error
  const admin = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: 'Database admin client unavailable.' }, { status: 500 })

  try {
    const payload = await request.json().catch(() => null)
    if ((payload as { action?: unknown } | null)?.action === 'create_upload') {
      const parsed = uploadSessionSchema.safeParse(payload)
      if (!parsed.success) {
        return NextResponse.json({ error: 'Enter valid website media details.' }, { status: 400, headers: noStoreHeaders })
      }
      const value = parsed.data
      const rateLimit = await enforceApiRateLimit(request, API_RATE_LIMITS.websiteMediaUpload, [
        auth.user.id,
        value.slotKey,
        value.action,
      ])
      if (rateLimit) return rateLimit
      const kind = expectedWebsiteMediaKind(value.slotKey)
      const validationError = fileValidationError(kind, value.mimeType, value.fileSize)
      if (validationError) {
        return NextResponse.json({ error: validationError }, { status: 400, headers: noStoreHeaders })
      }
      const extension = storageExtension(value.mimeType)
      const path = `${auth.access.workspaceId}/${value.slotKey}/${Date.now()}-${randomUUID()}.${extension}`
      const { error: grantError } = await admin.from('website_media_upload_grants').insert({
        workspace_id: auth.access.workspaceId,
        user_id: auth.user.id,
        slot_key: value.slotKey,
        storage_path: path,
        mime_type: value.mimeType,
        file_size: value.fileSize,
        expires_at: new Date(Date.now() + UPLOAD_GRANT_LIFETIME_MS).toISOString(),
      })
      if (grantError) throw new Error(grantError.message)
      return NextResponse.json({
        bucket: WEBSITE_MEDIA_BUCKET,
        path,
        endpoint: resumableUploadEndpoint(),
      }, { status: 201, headers: noStoreHeaders })
    }

    const parsed = finalizeSchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Enter valid website media details.' }, { status: 400, headers: noStoreHeaders })
    }
    const value = parsed.data
    const rateLimit = await enforceApiRateLimit(request, API_RATE_LIMITS.websiteMediaUpload, [
      auth.user.id,
      value.slotKey,
      value.action,
    ])
    if (rateLimit) return rateLimit
    const kind = expectedWebsiteMediaKind(value.slotKey)
    const validationError = fileValidationError(kind, value.mimeType, value.fileSize)
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400, headers: noStoreHeaders })
    }

    const expectedPrefix = `${auth.access.workspaceId}/${value.slotKey}/`
    if (!value.path.startsWith(expectedPrefix) || value.path.includes('..')) {
      return NextResponse.json({ error: 'That upload does not belong to this website slot.' }, { status: 403, headers: noStoreHeaders })
    }

    const { data: uploadGrant, error: grantError } = await admin
      .from('website_media_upload_grants')
      .select('id,mime_type,file_size,expires_at')
      .eq('workspace_id', auth.access.workspaceId)
      .eq('user_id', auth.user.id)
      .eq('slot_key', value.slotKey)
      .eq('storage_path', value.path)
      .is('finalized_at', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()
    if (grantError) throw new Error(grantError.message)
    if (!uploadGrant) {
      return NextResponse.json({ error: 'This upload session expired. Prepare and upload the file again.' }, { status: 403, headers: noStoreHeaders })
    }
    if (uploadGrant.mime_type !== value.mimeType || Number(uploadGrant.file_size) !== value.fileSize) {
      return NextResponse.json({ error: 'The uploaded file does not match its secure upload session.' }, { status: 409, headers: noStoreHeaders })
    }

    const pathParts = value.path.split('/')
    const objectName = pathParts.pop()
    const folder = pathParts.join('/')
    if (!objectName) return NextResponse.json({ error: 'Uploaded file was not found.' }, { status: 404, headers: noStoreHeaders })
    const { data: files, error: listError } = await admin.storage
      .from(WEBSITE_MEDIA_BUCKET)
      .list(folder, { search: objectName, limit: 20 })
    if (listError) throw new Error(listError.message)
    const uploaded = files?.find((file) => file.name === objectName)
    if (!uploaded) return NextResponse.json({ error: 'Upload has not finished yet.' }, { status: 409, headers: noStoreHeaders })

    const metadata = objectMetadata(uploaded)
    const verifiedMimeType = metadata.mimeType || value.mimeType
    const verifiedSize = metadata.size || value.fileSize
    const verifiedError = fileValidationError(kind, verifiedMimeType, verifiedSize)
    if (verifiedError) {
      return NextResponse.json({ error: verifiedError }, { status: 400, headers: noStoreHeaders })
    }

    const safeFileName = value.fileName.split(/[\\/]/).pop()?.trim() || objectName
    const { error: saveError } = await admin.from('website_media_slots').upsert({
      workspace_id: auth.access.workspaceId,
      slot_key: value.slotKey,
      media_type: kind,
      storage_path: value.path,
      file_name: safeFileName,
      mime_type: verifiedMimeType,
      file_size: verifiedSize,
      alt_text: value.altText,
      updated_by: auth.user.id,
    }, { onConflict: 'workspace_id,slot_key' })
    if (saveError) throw new Error(saveError.message)

    const { error: auditError } = await admin.from('workflow_audit_logs').insert({
      workspace_id: auth.access.workspaceId,
      actor_type: 'staff',
      actor_id: auth.user.id,
      action: 'WEBSITE_MEDIA_UPDATED',
      metadata: { slotKey: value.slotKey, fileName: safeFileName, fileSize: verifiedSize },
    })
    if (auditError) console.error('Website media audit write failed:', auditError)

    const { error: finalizeGrantError } = await admin
      .from('website_media_upload_grants')
      .update({ finalized_at: new Date().toISOString() })
      .eq('id', uploadGrant.id)
      .is('finalized_at', null)
    if (finalizeGrantError) throw new Error(finalizeGrantError.message)

    const media = await getWebsiteMediaForWorkspace(auth.access.workspaceId)
    return NextResponse.json(media.find((slot) => slot.slotKey === value.slotKey), {
      headers: noStoreHeaders,
    })
  } catch (error) {
    return secureErrorResponse(error, 'Failed to publish website media.', {
      request,
      context: 'POST /api/admin/website-media',
    })
  }
}

export async function PATCH(request: Request) {
  const auth = await authorize(request)
  if (auth.error || !auth.access || !auth.user) return auth.error
  const admin = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: 'Database admin client unavailable.' }, { status: 500 })

  try {
    const parsed = descriptionSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Enter a description between 3 and 180 characters.' }, { status: 400, headers: noStoreHeaders })
    const { data, error } = await admin
      .from('website_media_slots')
      .update({ alt_text: parsed.data.altText, updated_by: auth.user.id })
      .eq('workspace_id', auth.access.workspaceId)
      .eq('slot_key', parsed.data.slotKey)
      .select('slot_key')
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) {
      return NextResponse.json({ error: 'Upload a custom file before saving its description.' }, { status: 409, headers: noStoreHeaders })
    }
    const media = await getWebsiteMediaForWorkspace(auth.access.workspaceId)
    return NextResponse.json(media.find((slot) => slot.slotKey === parsed.data.slotKey), {
      headers: noStoreHeaders,
    })
  } catch (error) {
    return secureErrorResponse(error, 'Failed to update the media description.', {
      request,
      context: 'PATCH /api/admin/website-media',
    })
  }
}
