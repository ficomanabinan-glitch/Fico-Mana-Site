import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './helpers/load-ts.ts'

test('native file dialog opens, starts on Cancel, restores focus and blocks busy Escape', () => {
  let cleanup: (() => void) | undefined
  let opened = 0, closed = 0, cancelFocused = 0, restored = 0, dismissed = 0
  const previous = { isConnected: true, focus: () => restored++ }
  class FakeElement {}
  Object.setPrototypeOf(previous, FakeElement.prototype)
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const originalHTMLElement = Object.getOwnPropertyDescriptor(globalThis, 'HTMLElement')
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { activeElement: previous } })
  Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: FakeElement })
  try {
    let refIndex = 0
    const dialogModule = loadTs<{ default: (props: any) => any }>('components/file-delete-dialog.tsx', {
      react: {
        useRef: () => ({ current: refIndex++ % 2 === 0
          ? { showModal: () => opened++, close: () => closed++ }
          : { focus: () => cancelFocused++ } }),
        useEffect: (effect: () => () => void) => { cleanup = effect() },
      },
    })
    const render = (busy: boolean) => dialogModule.default({ fileName: 'photo.jpg', busy, error: '', onClose: () => dismissed++, onDelete: () => {} })
    const idle = render(false)
    assert.equal(idle.type, 'dialog')
    assert.equal(opened, 1)
    assert.equal(cancelFocused, 1)
    let prevented = 0
    idle.props.onCancel({ preventDefault: () => prevented++ })
    assert.equal(dismissed, 1)
    cleanup?.()
    assert.equal(closed, 1)
    assert.equal(restored, 1)
    const busy = render(true)
    busy.props.onCancel({ preventDefault: () => prevented++ })
    assert.equal(dismissed, 1)
    assert.equal(prevented, 2)
    cleanup?.()
  } finally {
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument)
    else Reflect.deleteProperty(globalThis, 'document')
    if (originalHTMLElement) Object.defineProperty(globalThis, 'HTMLElement', originalHTMLElement)
    else Reflect.deleteProperty(globalThis, 'HTMLElement')
  }
})
