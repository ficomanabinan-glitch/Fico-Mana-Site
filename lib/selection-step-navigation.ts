export type SelectionStep = 'photos' | 'prints' | 'addons' | 'review'
const order: SelectionStep[] = ['photos', 'prints', 'addons', 'review']

export function availableSelectionStep(target: SelectionStep, photosComplete: boolean, printsComplete: boolean, addonsValid: boolean): SelectionStep {
  if (target === 'photos' || !photosComplete) return 'photos'
  if (target === 'prints' || !printsComplete) return 'prints'
  if (target === 'addons' || !addonsValid) return 'addons'
  return 'review'
}

export function canVisitSelectionStep(current: SelectionStep, target: SelectionStep, photosComplete: boolean, printsComplete: boolean, addonsValid: boolean, locked = false) {
  return locked || order.indexOf(target) <= order.indexOf(current) || availableSelectionStep(target, photosComplete, printsComplete, addonsValid) === target
}
