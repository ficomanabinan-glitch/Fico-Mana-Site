import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import React, { createElement, isValidElement, type ReactElement, type ReactNode } from 'react'
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

test('admin Refresh still synchronizes first, then invokes the current page callback', async () => {
  const events: string[] = []
  const Refresh = () => createElement('button')
  const loaded = loadTs<HeaderModule>('components/admin-page-header.tsx', {
    '@/lib/admin-ui': {adminTitle:'title',adminSubtitle:'subtitle'},
    '@/components/workspace-refresh': {WorkspaceRefreshButton:Refresh},
    '@/components/admin-auto-sync': {useAdminAutoSync:()=>({syncing:false,syncNow:async()=>{events.push('sync')}})},
  })
  for (const page of ['sales','bookings']) {
    const tree = loaded.default({title:page,onRefresh:()=>{events.push(page)},refreshing:page==='bookings'})
    const refresh = findElement(tree,Refresh)!
    assert.equal(refresh.props.refreshing,page==='bookings')
    await (refresh.props.onRefresh as ()=>Promise<void>)()
  }
  assert.deepEqual(events,['sync','sales','sync','bookings'])
})

test('all workspace headers host Refresh and embedded queues do not duplicate it', () => {
  const read = (file:string) => readFileSync(file,'utf8')
  assert.match(read('app/admin/layout.tsx'), /<WorkspaceRefreshTarget \/>\s*<AdminSyncStatus \/>/)
  for (const file of ['app/admin/layout.tsx','components/editor-portal-shell.tsx','components/new-admin/shell.tsx']) {
    assert.match(read(file), /<WorkspaceRefreshProvider>/)
    assert.match(read(file), /<WorkspaceRefreshTarget \/>/)
  }
  for (const file of ['components/editor-queue.tsx','components/editor-dashboard.tsx','components/editor-upload-photos.tsx','components/admin-raw-photo-queue.tsx']) assert.match(read(file), /<WorkspaceRefreshButton /)
  assert.match(read('components/filtering-dashboard.tsx'), /activeTab === 'editor' \|\| activeTab === 'queue' \? undefined/)
  assert.match(read('components/new-admin/pages.tsx'), /<WorkspaceRefresh><Button/)
})
