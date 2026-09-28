/** Package Manager's category is authoritative; names, prices and selection counts are not. */
export const PHOTO_WORKFLOW_CATEGORIES = ['graduation', 'capping-pinning', 'creative', 'self-portrait'] as const

export function usesOnsiteWorkflow(category: unknown): boolean {
  return PHOTO_WORKFLOW_CATEGORIES.some(value => value === category)
}

/** Legacy name retained for callers: this is the editor selection workflow. */
export function usesGraduationWorkflow(category: unknown): boolean {
  return category === 'graduation' || category === 'capping-pinning' || category === 'creative'
}

export function includedPrintCategories(category: unknown) {
  if (category === 'creative') return ['TOGA_PICTURE_4R', 'ALAMPAY_BARONG_4R'] as const
  if (category === 'capping-pinning') return ['TOGA_PICTURE_4R', 'ALAMPAY_BARONG_4R', 'FRAME_8R'] as const
  if (category === 'graduation') return ['TOGA_PICTURE_4R', 'ALAMPAY_BARONG_4R', 'FRAME_8R', 'WALLET_SIZE'] as const
  return [] as const
}

export const GRADUATION_WORKFLOW_ONLY = 'Photo selection and editor batches are available for graduation, capping and pinning, and creative packages. Self-portrait clients receive a download-only portal.'

export class GraduationWorkflowOnlyError extends Error {
  constructor() { super(`${GRADUATION_WORKFLOW_ONLY} Try: manage this booking from Bookings instead.`) }
}
