import assert from 'node:assert/strict'
import test from 'node:test'
import { FOLDER_DELETE_CONFIRMATION, isFolderDeleteConfirmation } from '../lib/file-management-delete.ts'

test('folder deletion requires the exact case-sensitive confirmation phrase', () => {
  assert.equal(FOLDER_DELETE_CONFIRMATION, 'CONFIRM DELETE')
  assert.equal(isFolderDeleteConfirmation('CONFIRM DELETE'), true)
  assert.equal(isFolderDeleteConfirmation('confirm delete'), false)
  assert.equal(isFolderDeleteConfirmation('Confirm Delete'), false)
  assert.equal(isFolderDeleteConfirmation('CONFIRM DELETE '), false)
  assert.equal(isFolderDeleteConfirmation(null), false)
})
