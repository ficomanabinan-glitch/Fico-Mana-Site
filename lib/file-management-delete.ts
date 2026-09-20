export const FOLDER_DELETE_CONFIRMATION = 'CONFIRM DELETE' as const

export type FileManagementFolderScope = 'date' | 'booking' | 'category'

export function isFolderDeleteConfirmation(value: unknown): value is typeof FOLDER_DELETE_CONFIRMATION {
  return value === FOLDER_DELETE_CONFIRMATION
}
