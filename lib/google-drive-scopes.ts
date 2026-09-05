export const GOOGLE_DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
export const GOOGLE_DRIVE_READ_SCOPE = 'https://www.googleapis.com/auth/drive.readonly'

export const GOOGLE_DRIVE_SCOPES = [GOOGLE_DRIVE_FILE_SCOPE, GOOGLE_DRIVE_READ_SCOPE]

export function hasRequiredGoogleDriveScopes(value: string | null | undefined) {
  const granted = new Set(String(value || '').split(/\s+/).filter(Boolean))
  return GOOGLE_DRIVE_SCOPES.every((scope) => granted.has(scope))
}
