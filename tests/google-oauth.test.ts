import assert from 'node:assert/strict'
import test from 'node:test'
import {
  GOOGLE_DRIVE_FILE_SCOPE,
  GOOGLE_DRIVE_READ_SCOPE,
  hasRequiredGoogleDriveScopes,
} from '../lib/google-drive-scopes.ts'

test('requires both per-file write and Drive read scopes for direct RAW folder sync', () => {
  assert.equal(hasRequiredGoogleDriveScopes(GOOGLE_DRIVE_FILE_SCOPE), false)
  assert.equal(hasRequiredGoogleDriveScopes(GOOGLE_DRIVE_READ_SCOPE), false)
  assert.equal(
    hasRequiredGoogleDriveScopes(`${GOOGLE_DRIVE_FILE_SCOPE} openid ${GOOGLE_DRIVE_READ_SCOPE}`),
    true,
  )
})

test('treats missing or blank granted scopes as needing reconnection', () => {
  assert.equal(hasRequiredGoogleDriveScopes(null), false)
  assert.equal(hasRequiredGoogleDriveScopes(''), false)
})
