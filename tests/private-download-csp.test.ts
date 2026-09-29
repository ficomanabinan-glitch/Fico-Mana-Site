import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('browser CSP allows the exact private folder transfer Worker origin', () => {
  const config = readFileSync('next.config.mjs', 'utf8')
  const connectSource = config.match(/"connect-src ([^"\n]+)"/)?.[1]
  assert.ok(connectSource, 'The browser connect-src policy must be configured')
  assert.match(connectSource, /https:\/\/ficomana-private-downloads\.ficomana-downloads\.workers\.dev(?:\s|$)/)
  assert.doesNotMatch(connectSource, /https:\/\/\*\.workers\.dev/)
})
