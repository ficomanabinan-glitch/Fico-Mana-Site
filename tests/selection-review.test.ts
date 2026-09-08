import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './helpers/load-ts.ts'
import { memoryDb } from './helpers/memory-db.ts'

function fixture() {
  const date = '2026-09-08T01:00:00Z'
  const db = memoryDb({
    bookings: [{ id:'ONE',workspace_id:'studio',customer_name:'Client',customer_email:'client@example.test',raw_photo_status:'Rejected',raw_photo_notes:'Please replace the blurry photo.',raw_photo_submitted_at:date }],
    photo_selections: [{id:'selection',workspace_id:'studio',booking_id:'ONE',version:2,status:'OPEN'}],
    client_portals:[{workspace_id:'studio',booking_id:'ONE',public_id:'private-id'}],
  })
  const calls: unknown[] = []; const emails: unknown[] = []
  let failure = false; let emailFailure = false
  const service = loadTs<typeof import('../lib/selection-review.ts')>('lib/selection-review.ts', {
    '@/lib/supabase/admin': {getSupabaseAdmin:()=>({...db,rpc:async (_name:string,args:unknown)=>{calls.push(args);return {error:failure?{message:'Selection changed'}:null}}})},
    '@/lib/package-workflow-server': {assertGraduationBooking:async()=>{}},
    '@/lib/client-portal':{portalUrl:(id:string)=>`https://www.ficomana.com/portal/${id}`},
    '@/lib/email':{sendPortalSelectionRejectedEmail:async(input:unknown)=>{emails.push(input);return {success:!emailFailure}}},
  })
  return {service,db,calls,emails,date,fail:()=>{failure=true},failEmail:()=>{emailFailure=true}}
}
test('rejection sends the committed reason and private portal URL, while email-only retry never reviews again', async()=>{
  const f=fixture()
  await f.service.reviewSelection('studio','staff','ONE',{action:'Reject',reason:'Reason',submittedAt:f.date})
  assert.equal(f.calls.length,1)
  assert.deepEqual(f.emails[0],{bookingId:'ONE',name:'Client',email:'client@example.test',reason:'Please replace the blurry photo.',url:'https://www.ficomana.com/portal/private-id',revision:'selection-2'})
  await f.service.reviewSelection('studio','staff','ONE',{action:'RetryEmail',submittedAt:f.date})
  assert.equal(f.calls.length,1)
})
test('failed review never emails; invalid and stale requests fail safely',async()=>{
  const f=fixture();f.fail()
  await assert.rejects(f.service.reviewSelection('studio','staff','ONE',{action:'Reject',reason:'Reason',submittedAt:f.date}),/changed/)
  assert.equal(f.emails.length,0)
  await assert.rejects(f.service.reviewSelection('studio','staff','ONE',{action:'Bogus',submittedAt:f.date}),/Invalid/)
  await assert.rejects(f.service.reviewSelection('studio','staff','ONE',{action:'RetryEmail',submittedAt:'2026-09-09'}),/changed/)
})
test('email failure reports recovery without undoing review',async()=>{
  const f=fixture();f.failEmail()
  const result=await f.service.reviewSelection('studio','staff','ONE',{action:'Reject',reason:'Reason',submittedAt:f.date})
  assert.equal(result.success,true);assert.match(result.emailErrors![0],/Resend Email/)
})
