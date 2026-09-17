import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canManageStaffRole,
  changeOwnPasswordSchema,
  createStaffAccountSchema,
  staffAppMetadata,
} from '../lib/auth/staff-user-management.ts'

test('owners and admins can only grant roles within their authority', () => {
  assert.equal(canManageStaffRole('owner', 'admin'), true)
  assert.equal(canManageStaffRole('owner', 'editor'), true)
  assert.equal(canManageStaffRole('owner', 'owner'), false)
  assert.equal(canManageStaffRole('admin', 'editor'), true)
  assert.equal(canManageStaffRole('admin', 'admin'), false)
  assert.equal(canManageStaffRole('editor', 'staff'), false)
})

test('staff account validation requires a strong password and normalized email', () => {
  const valid = createStaffAccountSchema.parse({
    email: ' Editor@FicoMana.com ',
    displayName: 'Studio Editor',
    password: 'Secure_Studio_2026',
    role: 'editor',
  })
  assert.equal(valid.email, 'editor@ficomana.com')
  assert.equal(createStaffAccountSchema.safeParse({ ...valid, password: 'short' }).success, false)
})

test('password change rejects reuse and weak replacements', () => {
  assert.equal(changeOwnPasswordSchema.safeParse({ currentPassword: 'Old_Strong_2026', newPassword: 'Old_Strong_2026' }).success, false)
  assert.equal(changeOwnPasswordSchema.safeParse({ currentPassword: 'Old_Strong_2026', newPassword: 'weakpassword' }).success, false)
  assert.equal(changeOwnPasswordSchema.safeParse({ currentPassword: 'Old_Strong_2026', newPassword: 'New_Strong_2026' }).success, true)
})

test('role metadata preserves provider fields but replaces trusted roles', () => {
  assert.deepEqual(staffAppMetadata({ provider: 'email', roles: ['owner'] }, 'editor'), {
    provider: 'email',
    role: 'editor',
    roles: ['editor'],
  })
})
