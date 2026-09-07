import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './helpers/load-ts.ts'
import { memoryDb } from './helpers/memory-db.ts'

class DriveError extends Error { status:number; constructor(status:number){super(`Synthetic Drive ${status}`);this.status=status} }
class RawUploadError extends Error { status:number; constructor(message:string,status=409){super(message);this.status=status} }
function fixture(){
  const db=memoryDb({bookings:[{id:'ONE',workspace_id:'ws',client_id:'client'}],editing_jobs:[{booking_id:'ONE',workspace_id:'ws',batch_id:'batch'}],
    drive_folders:[{booking_id:'ONE',workspace_id:'ws',folder_type:'RAW',drive_folder_id:'raw'},{booking_id:'ONE',workspace_id:'ws',folder_type:'CLIENT',drive_folder_id:'client'}],
    booking_provisioning:[{booking_id:'ONE',workspace_id:'ws',drive_root_folder_id:'root',drive_client_folder_id:'client',drive_day_folder_id:'day'}],
    google_drive_settings:[{id:1,workspace_id:'ws',root_folder_id:'root'}]})
  const files:any={raw:{id:'raw',mimeType:'application/vnd.google-apps.folder',parents:['client']},client:{id:'client',mimeType:'application/vnd.google-apps.folder',parents:['day']}}
  const calls:string[]=[];let error=0,listError=0
  const code=loadTs<typeof import('../lib/onsite-drive-sync.ts')>('lib/onsite-drive-sync.ts',{
    '@/lib/raw-upload-contract':{RawUploadError},'@/lib/package-workflow-server':{assertGraduationBooking:async(_db:unknown,booking:string,ws:string)=>{assert.equal(booking,'ONE');assert.equal(ws,'ws')}},
    '@/lib/google-drive':{GoogleDriveRequestError:DriveError,getDriveFile:async(id:string)=>{calls.push(`read:${id}`);if(error)throw new DriveError(error);return files[id]},listDriveFiles:async(id:string)=>{calls.push(`list:${id}`);if(listError){const status=listError;listError=0;throw new DriveError(status)}return []}},
  })
  return {db,files,calls,setError:(status:number)=>error=status,setListError:(status:number)=>listError=status,
    run:()=>code.readOnsiteDrivePhotos(db as never,'ws','ONE',async()=>{calls.push('recover');return {rawFolderId:'new-raw',clientId:'client',batchId:'batch'}})}
}
test('healthy sync reads existing folders only; no refresh or repair and no writes',async()=>{
  const f=fixture();const result=await f.run();assert.equal(result.recovered,false);assert.deepEqual(f.calls,['read:raw','read:client','list:raw'])
  assert.ok(f.db.operations.every(op=>op.action==='select'))
})
for(const reason of ['404','trashed','root changed','missing mapping','wrong parent','list 404'])test(`Sync recovers only the affected hierarchy once for ${reason}`,async()=>{
  const f=fixture()
  if(reason==='404')f.setError(404)
  if(reason==='trashed')f.files.raw.trashed=true
  if(reason==='root changed')f.db.tables.google_drive_settings[0].root_folder_id='new-root'
  if(reason==='missing mapping')f.db.tables.drive_folders=[]
  if(reason==='wrong parent')f.files.raw.parents=['stale-client']
  if(reason==='list 404')f.setListError(404)
  assert.equal((await f.run()).recovered,true);assert.equal(f.calls.filter(call=>call==='recover').length,1)
})
for(const status of [401,403,429,500])test(`Drive ${status} fails safely without automatic repair`,async()=>{
  const f=fixture();f.setError(status);await assert.rejects(f.run(),/No repair was attempted/);assert.ok(!f.calls.includes('recover'))
})
test('shortcut, foreign booking and listing errors cannot trigger a destructive fallback',async()=>{
  for(const mode of ['shortcut','foreign','list']){
    const f=fixture();if(mode==='shortcut')f.files.raw.mimeType='application/vnd.google-apps.shortcut'
    if(mode==='foreign')f.files.raw.appProperties={bookingId:'TWO'}
    if(mode==='list')f.setListError(403)
    await assert.rejects(f.run());assert.ok(!f.calls.includes('recover'))
  }
})
