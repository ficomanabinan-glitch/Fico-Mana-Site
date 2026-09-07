import { isValidElement, type ReactElement } from 'react'

/** Execute React handlers with deterministic hook state, without a browser or provider. */
export function componentHarness() {
  const slots: any[] = []
  let cursor = 0
  let pending: Array<() => void> = []
  const react = {
    useState(initial: unknown) {
      const index = cursor++
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial
      return [slots[index], (value: any) => { slots[index] = typeof value === 'function' ? value(slots[index]) : value }]
    },
    useRef(value: unknown) { const index = cursor++; return slots[index] ||= { current: value } },
    useMemo(factory: () => unknown, deps: unknown[]) {
      const index = cursor++, previous = slots[index]
      if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) slots[index] = { deps, value: factory() }
      return slots[index].value
    },
    useEffect(effect: () => void | (() => void), deps: unknown[]) {
      const index = cursor++, previous = slots[index]
      if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
        slots[index] = { deps, cleanup: previous?.cleanup }
        pending.push(() => { slots[index].cleanup?.(); slots[index].cleanup = effect() })
      }
    },
  }
  return { react,
    render<T>(component: () => T) { cursor = 0; pending = []; const result = component(); pending.forEach(effect => effect()); return result },
    unmount() { slots.forEach(slot => slot?.cleanup?.()) },
  }
}

export function elements(node: unknown, predicate: (element: ReactElement<any>) => boolean): ReactElement<any>[] {
  if (Array.isArray(node)) return node.flatMap(child => elements(child, predicate))
  if (!isValidElement(node)) return []
  const element = node as ReactElement<any>
  return [...(predicate(element) ? [element] : []), ...elements(element.props.children, predicate)]
}
export function content(node: unknown): string {
  if (Array.isArray(node)) return node.map(content).join('')
  if (isValidElement(node)) return content((node as ReactElement<any>).props.children)
  return typeof node === 'string' || typeof node === 'number' ? String(node) : ''
}
