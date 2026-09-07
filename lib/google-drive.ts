import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { decryptGoogleRefreshToken, googleOAuthClientCredentials } from '@/lib/google-oauth'
import { googleThumbnailUrl, readBoundedResponse } from '@/lib/security/outbound-url'
import { assertGraduationBooking } from '@/lib/package-workflow-server'

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'
const FOLDER_MIME = 'application/vnd.google-apps.folder'

export class GoogleDriveConfigError extends Error {}

let cachedAccessToken: { value: string; expiresAt: number } | null = null

function env(name: string) {
  return process.env[name]?.trim() || ''
}

async function loadStoredRefreshToken() {
  const admin = getSupabaseAdmin()
  if (!admin) return null
  const { data } = await admin
    .from('google_drive_settings')
    .select('refresh_token_encrypted,account_email')
    .eq('id', 1)
    .maybeSingle()
  if (!data?.refresh_token_encrypted) return null
  return {
    refreshToken: decryptGoogleRefreshToken(String(data.refresh_token_encrypted)),
    accountEmail: data.account_email ? String(data.account_email) : null,
  }
}

export async function getGoogleDriveAccessToken(): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now()) return cachedAccessToken.value
  const stored = await loadStoredRefreshToken()
  const refreshToken = stored?.refreshToken || env('GOOGLE_REFRESH_TOKEN')
  let clientId = env('GOOGLE_CLIENT_ID')
  let clientSecret = env('GOOGLE_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    try {
      const creds = googleOAuthClientCredentials()
      clientId = creds.clientId
      clientSecret = creds.clientSecret
    } catch {
      // handled below
    }
  }

  if (!clientId || !clientSecret || !refreshToken) {
    throw new GoogleDriveConfigError(
      'Google Drive is not connected. Open Admin → Provisioning and connect the studio Google account.',
    )
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
    cache: 'no-store',
  })
  const data = (await response.json().catch(() => ({}))) as {
    access_token?: string
    expires_in?: number
    error_description?: string
  }
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || 'The Google Drive connection expired. Try: reconnect it from Client Portals.')
  }
  cachedAccessToken = {
    value: data.access_token,
    expiresAt: Date.now() + Math.max(60, Number(data.expires_in || 3600) - 300) * 1000,
  }
  return data.access_token
}

async function driveFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getGoogleDriveAccessToken()
  const response = await fetch(`${DRIVE_API}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })
  const data = (await response.json().catch(() => ({}))) as T & { error?: { message?: string } }
  if (!response.ok) {
    throw new Error(data.error?.message || `Google Drive request failed (${response.status}).`)
  }
  return data
}

function escapeDriveQuery(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

export function normalizeDriveFolderName(value: string) {
  return value
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/[\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
}

export type DriveFolder = {
  id: string
  name: string
  mimeType?: string
  parents?: string[]
  webViewLink?: string
}

export type DriveFile = {
  id: string
  name: string
  mimeType: string
  size?: string
  md5Checksum?: string
  parents?: string[]
  thumbnailLink?: string
  webContentLink?: string
  webViewLink?: string
  appProperties?: Record<string, string>
  trashed?: boolean
  modifiedTime?: string
  capabilities?: { canTrash?: boolean }
}

const DRIVE_FILE_FIELDS =
  'id,name,mimeType,size,md5Checksum,parents,thumbnailLink,webContentLink,webViewLink,appProperties'
const DRIVE_CLEANUP_FIELDS = `${DRIVE_FILE_FIELDS},trashed,modifiedTime,capabilities(canTrash)`

export async function getDriveCleanupFile(fileId: string): Promise<DriveFile> {
  return driveFetch<DriveFile>(
    `/files/${encodeURIComponent(fileId)}?fields=${encodeURIComponent(DRIVE_CLEANUP_FIELDS)}&supportsAllDrives=true`,
    { signal: AbortSignal.timeout(15_000) },
  )
}

/** Bounded, read-only listing for storage cleanup, including nested folders. */
export async function listDriveCleanupChildren(parentId: string, pageToken = '') {
  const params = new URLSearchParams({
    q: `'${escapeDriveQuery(parentId)}' in parents and trashed = false`,
    fields: `nextPageToken,files(${DRIVE_CLEANUP_FIELDS})`, pageSize: '1000', spaces: 'drive',
    supportsAllDrives: 'true', includeItemsFromAllDrives: 'true',
    ...(pageToken ? { pageToken } : {}),
  })
  return driveFetch<{ files?: DriveFile[]; nextPageToken?: string }>(`/files?${params}`, {
    signal: AbortSignal.timeout(15_000),
  })
}

/** Recoverable only. Never use the permanent files.delete endpoint for cleanup. */
export async function trashDriveFile(fileId: string) {
  const result = await driveFetch<{ id: string; trashed: boolean }>(
    `/files/${encodeURIComponent(fileId)}?fields=id,trashed&supportsAllDrives=true`, {
      method: 'PATCH', body: JSON.stringify({ trashed: true }), signal: AbortSignal.timeout(15_000),
    },
  )
  if (result.id !== fileId || !result.trashed) throw new Error('Drive did not confirm Trash.')
}

export async function listDriveFiles(parentId: string): Promise<DriveFile[]> {
  const files: DriveFile[] = []
  let pageToken = ''
  do {
    const q = [`'${escapeDriveQuery(parentId)}' in parents`, 'trashed = false'].join(' and ')
    const params = new URLSearchParams({
      q,
      fields: `nextPageToken,files(${DRIVE_FILE_FIELDS})`,
      pageSize: '1000',
      spaces: 'drive',
    })
    if (pageToken) params.set('pageToken', pageToken)
    const data = await driveFetch<{ files?: DriveFile[]; nextPageToken?: string }>(`/files?${params.toString()}`)
    files.push(...(data.files || []).filter((file) => file.mimeType !== FOLDER_MIME))
    pageToken = data.nextPageToken || ''
  } while (pageToken)
  return files
}

export async function getDriveFile(fileId: string): Promise<DriveFile> {
  return driveFetch<DriveFile>(
    `/files/${encodeURIComponent(fileId)}?fields=${encodeURIComponent(DRIVE_FILE_FIELDS)}&supportsAllDrives=true`,
  )
}

export async function downloadDriveFile(fileId: string): Promise<Buffer> {
  const response = await openDriveFile(fileId)
  return Buffer.from(await response.arrayBuffer())
}

export async function openDriveFile(fileId: string): Promise<Response> {
  const token = await getGoogleDriveAccessToken()
  const response = await fetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  if (!response.ok || !response.body) throw new Error(`Google Drive download failed (${response.status}).`)
  return response
}

export async function hashDriveFileSha256(fileId: string, maximumBytes: number) {
  const response = await openDriveFile(fileId)
  const reader = response.body!.getReader()
  const hash = createHash('sha256')
  let bytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > maximumBytes) {
        await reader.cancel('File exceeds the allowed verification size.')
        throw new Error('The uploaded Drive file exceeds the allowed size.')
      }
      hash.update(value)
    }
  } finally {
    reader.releaseLock()
  }
  return { checksum: hash.digest('hex'), bytes }
}

export async function downloadDriveThumbnail(thumbnailLink: string): Promise<Buffer> {
  const url = googleThumbnailUrl(thumbnailLink)
  const token = await getGoogleDriveAccessToken()
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`Google Drive thumbnail download failed (${response.status}).`)
  return readBoundedResponse(response, 8 * 1024 * 1024)
}

export async function copyDriveFile(input: {
  fileId: string
  destinationFolderId: string
  bookingId: string
  galleryFileId: string
  purpose?: string
}): Promise<DriveFile> {
  const source = await getDriveFile(input.fileId)
  const existing = (await listDriveFiles(input.destinationFolderId)).find(
    (file) => file.appProperties?.galleryFileId === input.galleryFileId,
  )
  if (existing) return existing
  return driveFetch<DriveFile>(
    `/files/${encodeURIComponent(input.fileId)}/copy?fields=${encodeURIComponent(DRIVE_FILE_FIELDS)}&supportsAllDrives=true`,
    {
      method: 'POST',
      body: JSON.stringify({
        name: source.name,
        parents: [input.destinationFolderId],
        appProperties: { bookingId: input.bookingId, galleryFileId: input.galleryFileId, purpose: input.purpose || 'selected' },
      }),
    },
  )
}

export async function upsertDriveFile(input: {
  destinationFolderId: string
  bookingId: string
  relativePath: string
  fileName: string
  mimeType: string
  checksum: string
  purpose?: 'raw' | 'deliverable' | 'print-manifest'
  data: Buffer
}): Promise<{ file: DriveFile; duplicate: boolean }> {
  const current = (await listDriveFiles(input.destinationFolderId)).find(
    (file) =>
      file.appProperties?.bookingId === input.bookingId &&
      file.appProperties?.relativePath === input.relativePath,
  )
  if (current?.appProperties?.checksum === input.checksum) return { file: current, duplicate: true }

  const token = await getGoogleDriveAccessToken()
  const boundary = `fico-mana-${crypto.randomUUID()}`
  const metadata = Buffer.from(
    JSON.stringify({
      name: normalizeDriveFolderName(input.fileName) || 'photo',
      ...(current ? {} : { parents: [input.destinationFolderId] }),
      appProperties: {
        bookingId: input.bookingId,
        relativePath: input.relativePath,
        checksum: input.checksum,
        purpose: input.purpose || 'deliverable',
      },
    }),
  )
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`),
    metadata,
    Buffer.from(`\r\n--${boundary}\r\nContent-Type: ${input.mimeType}\r\n\r\n`),
    input.data,
    Buffer.from(`\r\n--${boundary}--`),
  ])
  const endpoint = current
    ? `${DRIVE_UPLOAD_API}/files/${encodeURIComponent(current.id)}?uploadType=multipart&fields=${encodeURIComponent(DRIVE_FILE_FIELDS)}&supportsAllDrives=true`
    : `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=${encodeURIComponent(DRIVE_FILE_FIELDS)}&supportsAllDrives=true`
  const response = await fetch(endpoint, {
    method: current ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
    cache: 'no-store',
  })
  const data = (await response.json().catch(() => ({}))) as DriveFile & { error?: { message?: string } }
  if (!response.ok) throw new Error(data.error?.message || `Google Drive upload failed (${response.status}).`)
  return { file: data, duplicate: false }
}

/** Only verified edited uploads may be used here. Originals are never renamed or moved. */
export async function copyEnhancedPrint(input: {
  source: DriveFile
  destinationFolderId: string
  bookingId: string
  selectionId: string
  printKey: string
  checksum: string
  fileName: string
}) {
  const properties = {
    bookingId: input.bookingId,
    selectionId: input.selectionId,
    purpose: 'enhanced-print',
    printKey: input.printKey,
    sourceDriveFileId: input.source.id,
    checksum: input.checksum,
  }
  const previous = (await listDriveFiles(input.destinationFolderId)).filter(file =>
    file.appProperties?.bookingId === input.bookingId &&
    file.appProperties?.selectionId === input.selectionId &&
    file.appProperties?.purpose === 'enhanced-print' &&
    file.appProperties?.printKey === input.printKey,
  )
  const reusable = previous.find(file =>
    file.appProperties?.sourceDriveFileId === input.source.id &&
    file.appProperties?.checksum === input.checksum &&
    file.name === input.fileName &&
    file.size === input.source.size && file.md5Checksum === input.source.md5Checksum,
  )
  const result = reusable || await driveFetch<DriveFile>(
    `/files/${encodeURIComponent(input.source.id)}/copy?fields=${encodeURIComponent(DRIVE_FILE_FIELDS)}&supportsAllDrives=true`,
    { method: 'POST', body: JSON.stringify({ name: input.fileName, parents: [input.destinationFolderId], appProperties: properties }) },
  )
  if (!result.parents?.includes(input.destinationFolderId) || result.name !== input.fileName ||
    result.size !== input.source.size || !input.source.md5Checksum || result.md5Checksum !== input.source.md5Checksum) {
    throw new Error('The enhanced print copy could not be verified. Try: retry this client upload.')
  }
  // Replace only earlier system-generated copies of this exact print slot, after a verified copy exists.
  // Unrelated/manual files and both RAW and enhanced originals are untouched; replacement is recoverable.
  for (const old of previous) {
    if (old.id !== result.id && old.id !== input.source.id) await trashDriveFile(old.id)
  }
  return result
}

export async function createDriveResumableUpload(input: {
  destinationFolderId: string
  existingDriveFileId?: string | null
  bookingId: string
  relativePath: string
  fileName: string
  mimeType: string
  fileSize: number
  checksum: string
  purpose?: 'raw' | 'deliverable'
  uploadKey?: string
}): Promise<string> {
  const token = await getGoogleDriveAccessToken()
  const metadata = {
    name: normalizeDriveFolderName(input.fileName) || 'photo',
    ...(input.existingDriveFileId ? {} : { parents: [input.destinationFolderId] }),
    appProperties: {
      bookingId: input.bookingId,
      relativePath: input.relativePath,
      checksum: input.checksum,
      purpose: input.purpose || 'deliverable',
      ...(input.purpose === 'raw' ? { rawUploadKey: input.uploadKey || '', rawVerification: 'pending' } : {}),
    },
  }
  const filePath = input.existingDriveFileId
    ? `/files/${encodeURIComponent(input.existingDriveFileId)}`
    : '/files'
  const response = await fetch(
    `${DRIVE_UPLOAD_API}${filePath}?uploadType=resumable&fields=${encodeURIComponent(DRIVE_FILE_FIELDS)}&supportsAllDrives=true`,
    {
      method: input.existingDriveFileId ? 'PATCH' : 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': input.mimeType,
        'X-Upload-Content-Length': String(input.fileSize),
      },
      body: JSON.stringify(metadata),
      cache: 'no-store',
    },
  )
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: { message?: string } }
    throw new Error(data.error?.message || `Could not start Google Drive upload (${response.status}).`)
  }
  const location = response.headers.get('location')
  if (!location) throw new Error('Google Drive did not return a resumable upload URL.')
  return location
}

/** Promote a newly verified original from its isolated upload folder. No existing original is replaced. */
export async function promoteRawUpload(file: DriveFile, incomingFolderId: string, rawFolderId: string) {
  const inRaw = file.parents?.length === 1 && file.parents[0] === rawFolderId
  if (!inRaw && !(file.parents?.length === 1 && file.parents[0] === incomingFolderId)) {
    throw new Error('The pending photo is outside its authorized upload folder.')
  }
  const params = new URLSearchParams({ fields: DRIVE_FILE_FIELDS, supportsAllDrives: 'true',
    ...(!inRaw ? { addParents: rawFolderId, removeParents: incomingFolderId } : {}),
  })
  const promoted = await driveFetch<DriveFile>(`/files/${encodeURIComponent(file.id)}?${params}`, {
    method: 'PATCH', body: JSON.stringify({ appProperties: { ...file.appProperties, rawVerification: 'verified' } }),
  })
  if (!promoted.parents?.includes(rawFolderId) || promoted.appProperties?.rawVerification !== 'verified') {
    throw new Error('Drive did not confirm the verified photo destination.')
  }
  return promoted
}

export async function getDriveFolder(id: string): Promise<DriveFolder> {
  const folder = await driveFetch<DriveFolder>(
    `/files/${encodeURIComponent(id)}?fields=id,name,mimeType,parents,webViewLink&supportsAllDrives=true`,
  )
  if (folder.mimeType !== FOLDER_MIME) throw new Error('The Google Drive ID does not point to a folder.')
  return folder
}

export async function findFolder(parentId: string, name: string): Promise<DriveFolder | null> {
  const q = [
    `'${escapeDriveQuery(parentId)}' in parents`,
    `name = '${escapeDriveQuery(name)}'`,
    `mimeType = '${FOLDER_MIME}'`,
    'trashed = false',
  ].join(' and ')
  const params = new URLSearchParams({
    q,
    fields: 'files(id,name,parents,webViewLink)',
    pageSize: '10',
    spaces: 'drive',
  })
  const data = await driveFetch<{ files?: DriveFolder[] }>(`/files?${params.toString()}`)
  return data.files?.[0] ?? null
}

export async function createFolder(parentId: string, name: string): Promise<DriveFolder> {
  const safeName = normalizeDriveFolderName(name)
  return driveFetch<DriveFolder>('/files?fields=id,name,parents,webViewLink&supportsAllDrives=true', {
    method: 'POST',
    body: JSON.stringify({ name: safeName, mimeType: FOLDER_MIME, parents: [parentId] }),
  })
}

export async function findOrCreateFolder(parentId: string, name: string): Promise<DriveFolder> {
  const safeName = normalizeDriveFolderName(name)
  return (await findFolder(parentId, safeName)) ?? createFolder(parentId, safeName)
}

export async function renameFolder(folderId: string, newName: string): Promise<DriveFolder> {
  return driveFetch<DriveFolder>(`/files/${encodeURIComponent(folderId)}?fields=id,name,parents,webViewLink&supportsAllDrives=true`, {
    method: 'PATCH',
    body: JSON.stringify({ name: normalizeDriveFolderName(newName) }),
  })
}

export async function moveFolder(folderId: string, newParentId: string): Promise<DriveFolder> {
  const current = await getDriveFolder(folderId)
  const oldParents = current.parents?.join(',') || ''
  const params = new URLSearchParams({
    addParents: newParentId,
    fields: 'id,name,parents,webViewLink',
    supportsAllDrives: 'true',
  })
  if (oldParents) params.set('removeParents', oldParents)
  return driveFetch<DriveFolder>(`/files/${encodeURIComponent(folderId)}?${params.toString()}`, {
    method: 'PATCH',
    body: JSON.stringify({}),
  })
}

export async function resolveDriveRootFolder(admin: SupabaseClient): Promise<DriveFolder> {
  const { data: settings } = await admin
    .from('google_drive_settings')
    .select('root_folder_id, root_folder_name')
    .eq('id', 1)
    .maybeSingle()

  const configuredId = String(settings?.root_folder_id || env('GOOGLE_DRIVE_ROOT_FOLDER_ID') || '').trim()
  if (configuredId) {
    const folder = await getDriveFolder(configuredId)
    if (!settings?.root_folder_id) {
      await admin.from('google_drive_settings').update({ root_folder_id: folder.id, updated_at: new Date().toISOString() }).eq('id', 1)
    }
    return folder
  }

  return initializeDriveRootFolder(admin)
}

export async function initializeDriveRootFolder(admin: SupabaseClient): Promise<DriveFolder> {
  const { data: settings } = await admin
    .from('google_drive_settings')
    .select('root_folder_name')
    .eq('id', 1)
    .maybeSingle()

  const rootName = normalizeDriveFolderName(String(settings?.root_folder_name || 'FICOMANA SHOOTS')) || 'FICOMANA SHOOTS'
  const folder = (await findFolder('root', rootName)) ?? (await createFolder('root', rootName))
  await admin
    .from('google_drive_settings')
    .update({ root_folder_id: folder.id, root_folder_name: rootName, updated_at: new Date().toISOString() })
    .eq('id', 1)
  return folder
}

export async function ensureShootHierarchy(input: {
  admin: SupabaseClient
  bookingId: string
  shootDate: string
  clientName: string
  selectionLimit?: number
  existingClientFolderId?: string | null
}) {
  await assertGraduationBooking(input.admin, input.bookingId)
  const root = await resolveDriveRootFolder(input.admin)
  const date = new Date(`${input.shootDate}T00:00:00`)
  if (Number.isNaN(date.getTime())) throw new Error('A valid shoot date is required for Drive provisioning.')

  const monthName = date.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' }).toUpperCase()
  const dayName = `${monthName} ${date.getUTCDate()}`
  const month = await findOrCreateFolder(root.id, monthName)
  const day = await findOrCreateFolder(month.id, dayName)

  const baseClientName = normalizeDriveFolderName(input.clientName).toUpperCase() || input.bookingId
  let client: DriveFolder

  if (input.existingClientFolderId) {
    client = await getDriveFolder(input.existingClientFolderId)
    if (!client.parents?.includes(day.id)) client = await moveFolder(client.id, day.id)
    if (client.name !== baseClientName && !client.name.endsWith(` - ${input.bookingId}`)) {
      const collision = await findFolder(day.id, baseClientName)
      const desired = collision && collision.id !== client.id ? `${baseClientName} - ${input.bookingId}` : baseClientName
      client = await renameFolder(client.id, desired)
    }
  } else {
    const collision = await findFolder(day.id, baseClientName)
    client = collision
      ? await findOrCreateFolder(day.id, `${baseClientName} - ${input.bookingId}`)
      : await createFolder(day.id, baseClientName)
  }

  const raw = await findOrCreateFolder(client.id, 'RAW')
  const selectedName = `SELECTED ${Math.max(0, input.selectionLimit ?? 5)} PHOTOS`
  const legacySelected = await findFolder(client.id, `${Math.max(0, input.selectionLimit ?? 5)} SELECTED PHOTOS`)
  const selected = await findFolder(client.id, selectedName) || (legacySelected
    ? await renameFolder(legacySelected.id, selectedName)
    : await createFolder(client.id, selectedName))
  const edited = await findOrCreateFolder(client.id, 'EDITED PHOTOS')
  const deliverables = await findOrCreateFolder(client.id, 'DELIVERABLES')

  return {
    root,
    month,
    day,
    client,
    raw,
    selected,
    edited,
    deliverables,
    clientUrl: client.webViewLink || `https://drive.google.com/drive/folders/${client.id}`,
  }
}

export { DRIVE_UPLOAD_API }
