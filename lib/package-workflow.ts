/** Package Manager's category is authoritative; names, prices and selection counts are not. */
export function usesGraduationWorkflow(category: unknown): boolean {
  return category === 'graduation'
}

export const GRADUATION_WORKFLOW_ONLY = 'Client portals and online photo galleries are only available for graduation packages. Self-portrait photos are edited and handed over onsite.'

export class GraduationWorkflowOnlyError extends Error {
  constructor() { super(`${GRADUATION_WORKFLOW_ONLY} Try: manage this booking from Bookings instead.`) }
}
