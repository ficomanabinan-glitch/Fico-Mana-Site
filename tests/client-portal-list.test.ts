import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { filterAndSortClientPortals, provisioningStatuses } from '../lib/client-portal-list.ts'

const items = provisioningStatuses.map((status,index)=>({
  bookingId: `B-${index}`, customerName: `Client ${index}`, customerEmail: `${index}@example.com`,
  shootDate: `2026-09-${String(10+index).padStart(2,'0')}`, packageName: index%2?'Toga':'Portrait', provisioningStatus: status.value,
}))

test('Client Portals filters every provisioning status and combines it with search', () => {
  for(const status of provisioningStatuses) {
    assert.deepEqual(filterAndSortClientPortals(items,'',status.value,'newest').map(row=>row.provisioningStatus),[status.value])
  }
  assert.equal(filterAndSortClientPortals(items,' toga ','PARTIAL_FAILURE','newest').length,1)
  assert.equal(filterAndSortClientPortals(items,'missing','ACTIVE','newest').length,0)
  assert.equal(filterAndSortClientPortals(items,'B-0','ALL','newest').length,1)
})

test('Client Portals sorting is deterministic and does not mutate the source records', () => {
  const snapshot=JSON.stringify(items)
  assert.equal(filterAndSortClientPortals(items,'','ALL','oldest')[0].bookingId,'B-0')
  assert.equal(filterAndSortClientPortals(items,'','ALL','newest')[0].bookingId,'B-4')
  assert.deepEqual(filterAndSortClientPortals(items,'','ALL','status').map(row=>row.provisioningStatus),
    ['FAILED','PARTIAL_FAILURE','NOT_STARTED','PROVISIONING','ACTIVE'])
  assert.equal(filterAndSortClientPortals([...items].reverse(),'','ALL','client')[0].customerName,'Client 0')
  assert.equal(JSON.stringify(items),snapshot)
})

test('Client Portals uses the available width and keeps Portal/QR actions without the redundant Copy button', async()=> {
  const page=await readFile('app/admin/provisioning/page.tsx','utf8')
  assert.match(page,/w-full min-w-0 space-y-6/)
  assert.doesNotMatch(page,/max-w-7xl|copyPortal|portalCopying/)
  assert.match(page,/min-w-\[330px\]/)
  assert.ok(page.includes('lg:grid-cols-[minmax(0,1fr)_200px_230px]'),'filters stack when the sidebar leaves too little width')
  assert.ok(page.includes('xl:grid-cols-[minmax(0,1fr)_180px_auto]'),'Drive settings align in one row only when there is room')
  assert.match(page,/filterAndSortClientPortals/)
  assert.match(page,/showPortalQr/)
  assert.match(page,/openPortal/)
})
