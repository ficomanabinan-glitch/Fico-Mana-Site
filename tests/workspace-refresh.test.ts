import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import React, { isValidElement, type ReactElement, type ReactNode } from 'react'
import { loadTs } from './helpers/load-ts.ts'

type RefreshModule = typeof import('../components/workspace-refresh.tsx')
type HeaderModule = typeof import('../components/admin-page-header.tsx')

test('moving Refresh preserves the actual button, handler and disabled state', async () => {
  let location: {target: object | null} | null = null
  const portals: Array<{child: ReactNode; target: object}> = []
  const loaded = loadTs<RefreshModule>('components/workspace-refresh.tsx', {
    react: {...React, useContext: () => location},
    'react-dom': {createPortal: (child: ReactNode, target: object) => {portals.push({child,target}); return child}},
    '@/lib/admin-ui': {adminBtnGhost:'existing-button-style'},
  })
  let calls = 0
  const onRefresh = () => { calls++ }
  const wrapper = loaded.WorkspaceRefreshButton({onRefresh,refreshing:false}) as ReactElement<{children:ReactElement<{onClick:()=>void;disabled:boolean;'aria-label':string}>}>
  const button = wrapper.props.children
  assert.equal(button.props.onClick, onRefresh)
  assert.equal(button.props.disabled, false)
  assert.equal(loaded.WorkspaceRefresh({children:button}), button, 'standalone views retain the control')
  location = {target:null}
  assert.equal(loaded.WorkspaceRefresh({children:button}), null, 'no duplicate page-level button while mounting')
  location = {target:{}}
  assert.equal(loaded.WorkspaceRefresh({children:button}), button)
  assert.equal(portals[0].child, button)
  assert.equal(portals[0].target, location.target)
  button.props.onClick()
  assert.equal(calls, 1)
  const busy = loaded.WorkspaceRefreshButton({onRefresh,refreshing:true}) as typeof wrapper
  assert.equal(busy.props.children.props.disabled, true)
  assert.equal(busy.props.children.props['aria-label'], 'Refreshing…')
})

function findElement(node: ReactNode, type: unknown): ReactElement<Record<string, unknown>> | undefined {
  if (Array.isArray(node)) return node.map(child => findElement(child,type)).find(Boolean)
  if (!isValidElement<Record<string, unknown>>(node)) return undefined
  if (node.type === type) return node
  return findElement(node.props.children as ReactNode,type)
}

test('admin page headers no longer render a Refresh control', () => {
  let calls = 0
  const loaded = loadTs<HeaderModule>('components/admin-page-header.tsx', {
    '@/lib/admin-ui': {adminTitle:'title',adminSubtitle:'subtitle'},
  })
  const tree = loaded.default({title:'Bookings',onRefresh:()=>{calls++},refreshing:true})
  assert.equal(findElement(tree,'button'), undefined)
  assert.equal(calls, 0)
})

test('admin and editor workspace headers remove Refresh and keep one shared Sync control', () => {
  const read = (file:string) => readFileSync(file,'utf8')
  assert.match(read('app/admin/layout.tsx'), /<AdminSyncStatus \/>/)
  for (const file of ['app/admin/layout.tsx','components/editor-portal-shell.tsx','components/new-admin/shell.tsx']) {
    assert.match(read(file), /<WorkspaceRefreshProvider>/)
    assert.doesNotMatch(read(file), /WorkspaceRefreshTarget/)
  }
  assert.doesNotMatch(read('components/admin-page-header.tsx'), /WorkspaceRefreshButton/)

  const syncStatus = read('components/admin-sync-status.tsx')
  assert.match(syncStatus, /failed \? 'bg-red-500' : 'bg-green-400'/)
  assert.match(syncStatus, /\{syncing \? 'Syncing…' : 'Sync'\}/)
  assert.doesNotMatch(syncStatus, /Auto-sync|Sync issue/)
})
