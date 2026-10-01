import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { loadTs } from './helpers/load-ts.ts'
import type { PortalRawDownloadAccess } from '../lib/portal-raw-downloads.ts'

const { default: PortalOriginalDownload } = loadTs<typeof import('../components/portal-original-download.tsx')>(
  'components/portal-original-download.tsx',
  { '@/lib/private-attachment-download': { startPrivateAttachmentDownload: async () => undefined } },
)

function render(requestStatus: PortalRawDownloadAccess['requestStatus'], downloadUrl: string | null) {
  return renderToStaticMarkup(createElement(PortalOriginalDownload, {
    total: 10,
    totalBytes: 1024 * 1024,
    access: { allowed: Boolean(downloadUrl), completedInWindow: 0, activeDownloads: 0, limit: 2, requestStatus, nextAvailableAt: null },
    downloadUrl,
    requestUrl: '/synthetic/download-request',
    onAccessChanged: async () => undefined,
  }))
}

test('a granted download uses the client-facing Download Again label', () => {
  const markup = render('GRANTED', '/synthetic/download')
  assert.match(markup, />Download Again<\/button>/)
  assert.doesNotMatch(markup, /Use granted download/i)
  assert.match(markup, /0 of 2 weekly download slots used/)
})

test('first downloads and pending requests keep their existing action labels', () => {
  assert.match(render('AVAILABLE', '/synthetic/download'), />Download all photos<\/button>/)
  assert.match(render('PENDING', null), /Download request sent/)
})
