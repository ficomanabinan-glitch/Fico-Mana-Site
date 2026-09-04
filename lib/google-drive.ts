import type { SupabaseClient } from '@supabase/supabase-js'

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'
const FOLDER_MIME = 'application/vnd.google-apps.folder'

export class GoogleDriveConfigError extends Error {}

function env(name: string) {
  return process.env[name]?.trim() || ''
}

async function getAccessToken(): Promise<string> {
  const clientId = env('GOOGLE_CLIENT_ID')
  const clientSecret = env('GOOGLE_CLIENT_SECRET')
  const refreshToken = env('GOOGLE_REFRESH_TOKEN')

  if (!clientId || !clientSecret || !refreshToken) {
    throw new GoogleDriveConfigError(
      'Google Drive is not connected. Configure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN.',
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
  const data = (await response.json().catch(() => ({}))) as { access_token?: string; error_description?: string }
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || 'Google OAuth token refresh failed.')
  }
  return data.access_token
}

async function driveFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken()
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
  parents?: string[]
  webViewLink?: string
}

export async function getDriveFolder(id: string): Promise<DriveFolder> {
  return driveFetch<DriveFolder>(`/files/${encodeURIComponent(id)}?fields=id,name,parents,webViewLink&supportsAllDrives=true`)
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
  existingClientFolderId?: string | null
}) {
  const root = await resolveDriveRootFolder(input.admin)
  const date = new Date(`${input.shootDate}T00:00:00`)
  if (Number.isNaN(date.getTime())) throw new Error('A valid shoot date is required for Drive provisioning.')

  const monthName = date.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' }).toUpperCase()
  const dayName = String(date.getUTCDate()).padStart(2, '0')
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

  return {
    root,
    month,
    day,
    client,
    clientUrl: client.webViewLink || `https://drive.google.com/drive/folders/${client.id}`,
  }
}

// Reserved for future approved-deliverable uploads without adding another Google client.
export { DRIVE_UPLOAD_API }
