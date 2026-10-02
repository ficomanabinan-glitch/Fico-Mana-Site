import assert from 'node:assert/strict'
import test from 'node:test'
import { componentHarness, elements, content } from './helpers/component-harness.ts'
import { loadTs } from './helpers/load-ts.ts'

/** SC3 / R3-R5: preparation, failure recovery and endpoint isolation; synthetic only. */
test('icon download announces preparation, keeps errors readable and allows retry without bulk calls', async t => {
  const hooks = componentHarness(); t.after(hooks.unmount)
  const endpoints: string[] = []
  let reject!: (error: Error) => void
  let complete!: () => void
  const { default: Download } = loadTs<typeof import('../components/portal-single-photo-download.tsx')>(
    'components/portal-single-photo-download.tsx', {
      react: hooks.react,
      '@/lib/private-attachment-download': { startPrivateAttachmentDownload: (endpoint: string) => {
        endpoints.push(endpoint)
        return new Promise<void>((resolve, fail) => { complete = resolve; reject = fail })
      } },
      './portal-workspace.module.css': { photoDownload: 'overlay', photoDownloadButton: 'icon', photoDownloadError: 'error' },
    })
  const render = () => hooks.render(() => Download({ publicId: 'synthetic-portal', fileId: 'original-01', kind: 'original', fileName: 'AMIHAN-01.JPG', overlay: true }))
  let tree = render()
  const button = () => elements(tree, el => el.type === 'button')[0]
  assert.equal(button().props['aria-label'], 'Download AMIHAN-01.JPG')
  assert.equal(content(button()), '', 'icon variant has no visible text label')
  let stopped = 0
  button().props.onClick({ stopPropagation: () => stopped++ }); tree = render()
  assert.equal(stopped, 1)
  assert.equal(button().props.disabled, true)
  assert.equal(button().props['aria-busy'], true)
  assert.equal(content(elements(tree, el => el.props.role === 'status')[0]), 'Preparing download…')
  button().props.onClick({ stopPropagation() {} })
  assert.equal(endpoints.length, 1, 'busy control cannot start a duplicate preparation')
  reject(new Error('Photo could not be prepared. Try again.'))
  await new Promise(resolve => setImmediate(resolve)); tree = render()
  assert.equal(button().props.disabled, false)
  assert.equal(content(elements(tree, el => el.props.role === 'alert')[0]), 'Photo could not be prepared. Try again.')
  button().props.onClick({ stopPropagation() {} }); tree = render()
  assert.equal(elements(tree, el => el.props.role === 'alert').length, 0)
  complete(); await new Promise(resolve => setImmediate(resolve)); tree = render()
  assert.equal(button().props.disabled, false)
  assert.deepEqual(endpoints, Array(2).fill('/api/editor-workflow/portal/synthetic-portal/single-photo/original-01?kind=original'))
})
