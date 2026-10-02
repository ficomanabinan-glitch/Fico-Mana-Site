import assert from 'node:assert/strict'
import test from 'node:test'
import { clientWorkspaceHref, safeClientWorkspaceReturn, staffWorkflowHref } from '../lib/client-workspace-navigation.ts'

const client = '11111111-1111-4111-8111-111111111111'
test('client workspace retains customer identity independently of the selected booking', () => {
  assert.equal(clientWorkspaceHref('FM-100001',client), `/admin/clients/${client}?booking=FM-100001`)
  assert.equal(clientWorkspaceHref('FM-100002',client), `/admin/clients/${client}?booking=FM-100002`)
  assert.equal(clientWorkspaceHref('FM-100003'), '/admin/clients/booking%3AFM-100003?booking=FM-100003')
})
test('staff links use proper production host but stay local for isolated tests', () => {
  assert.equal(staffWorkflowHref('/editor/files?booking=FM-100001','http://127.0.0.1:3200'), '/editor/files?booking=FM-100001')
  assert.equal(staffWorkflowHref('/editor/files','https://admin.ficomana.com'), 'https://editor.ficomana.com/editor/files')
  assert.equal(staffWorkflowHref(`/admin/clients/${client}`,'https://editor.ficomana.com'),`https://admin.ficomana.com/admin/clients/${client}`)
})
test('workspace return allows only customer routes and exact booking context', () => {
  assert.equal(safeClientWorkspaceReturn(`/admin/clients/${client}?booking=FM-100001`),`/admin/clients/${client}?booking=FM-100001`)
  assert.equal(safeClientWorkspaceReturn('/admin/clients/booking%3AFM-100003?booking=FM-100003'),'/admin/clients/booking%3AFM-100003?booking=FM-100003')
  assert.equal(safeClientWorkspaceReturn('/admin/clients/booking%3AFM-W20260920-001?booking=FM-W20260920-001'),'/admin/clients/booking%3AFM-W20260920-001?booking=FM-W20260920-001')
  for (const malicious of ['https://evil.test/admin/clients/'+client, '//evil.test/admin/clients/'+client, 'javascript:alert(1)', '/admin/users','/admin/clients/not-a-client', `/admin/clients/${client}?booking=anything`, `/admin/clients/${client}/../users`]) assert.equal(safeClientWorkspaceReturn(malicious), null, malicious)
})
