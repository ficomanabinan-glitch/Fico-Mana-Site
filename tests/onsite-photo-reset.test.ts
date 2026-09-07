import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './helpers/load-ts.ts'
import { memoryDb } from './helpers/memory-db.ts'

class DriveError extends Error{status:number;constructor(status:number){super('Synthetic Drive failure');this.status=status}}
class RawUploadError extends Error{status:number;constructor(message:string,status=409){super(message);this.status=status}}
const ctx={workspaceId:'ws',bookingId:'ONE',actorId:'staff'}
function fixture(){
  const db=memoryDb({photo_selections:[{id:'selection',workspace_id:'ws',booking_id:'ONE',status:'COPY_FAILED',raw_upload_generation:0}],
    editing_jobs:[{workspace_id:'ws',booking_id:'ONE',status:'WAITING_FOR_SELECTION'}],
    gallery_files:[{id:'photo',workspace_id:'ws',booking_id:'ONE',drive_file_id:'photo',thumbnail_reference:'ws/ONE/thumb.jpg'}],
    drive_folders:[{id:'r',workspace_id:'ws',booking_id:'ONE',folder_type:'RAW',drive_folder_id:'raw'},{id:'c',workspace_id:'ws',booking_id:'ONE',folder_type:'CLIENT',drive_folder_id:'client'}]})
  const files:Record<string,any>={client:{id:'client',name:'Client',mimeType:'application/vnd.google-apps.folder',parents:['day'],appProperties:{bookingId:'ONE'}},raw:{id:'raw',name:'RAW',mimeType:'application/vnd.google-apps.folder',parents:['client']},photo:{id:'photo',name:'photo.JPG',mimeType:'image/jpeg',parents:['raw'],modifiedTime:'today'}}
  const trashed:string[]=[],removed:string[]=[];let failure='',started=0
  const admin={...db,storage:{from:()=>({remove:async(paths:string[])=>{removed.push(...paths);return{error:null}}})},rpc:async(name:string,args:any)=>{
    if(name==='begin_onsite_photo_reset'){
      started++;db.tables.photo_selections[0].raw_reset_id='reset';db.tables.onsite_photo_resets=[{id:'reset',workspace_id:'ws',booking_id:'ONE',state:'RUNNING',targets:args.p_targets,completed_ids:[]}];return{data:'reset',error:null}
    }
    const reset=db.tables.onsite_photo_resets[0]
    if(name==='record_onsite_photo_reset_progress'){reset.completed_ids=[...new Set([...reset.completed_ids,...args.p_completed])];return{data:reset.completed_ids.length,error:null}}
    if(name==='finish_onsite_photo_reset'){reset.state='COMPLETED';db.tables.gallery_files=[];db.tables.photo_selections[0].raw_reset_id=null;return{error:null}}
    throw new Error(name)
  }}
  const code=loadTs<typeof import('../lib/onsite-photo-reset.ts')>('lib/onsite-photo-reset.ts',{
    '@/lib/supabase/admin':{getSupabaseAdmin:()=>admin},'@/lib/raw-upload-contract':{RawUploadError},'@/lib/package-workflow-server':{assertGraduationBooking:async()=>{}},
    '@/lib/google-drive':{GoogleDriveRequestError:DriveError,getDriveCleanupFile:async(id:string)=>{if(failure===`read:${id}`)throw new DriveError(403);if(!files[id])throw new DriveError(404);return files[id]},
      listDriveCleanupChildren:async(id:string)=>({files:Object.values(files).filter(file=>file.parents?.includes(id)&&!file.trashed)}),
      trashDriveFile:async(id:string)=>{if(failure===id)throw new DriveError(503);trashed.push(id);files[id].trashed=true}},
  })
  return{db,files,trashed,removed,code,setFailure:(value:string)=>failure=value,get started(){return started},begin:()=>code.beginOnsitePhotoReset(ctx),resume:()=>code.continueOnsitePhotoReset(ctx,'reset')}
}
test('Delete Files removes only RAW uploads and scoped previews, keeps folder structure, and retries without repeat trash',async()=>{
  const f=fixture();await f.begin();assert.equal(f.trashed.length,0,'Preparing is read-only')
  assert.equal((await f.resume()).complete,true);assert.deepEqual(f.trashed,['photo']);assert.deepEqual(f.removed,['ws/ONE/thumb.jpg'])
  await f.resume();assert.deepEqual(f.trashed,['photo']);assert.ok(!f.files.raw.trashed&&!f.files.client.trashed)
})
test('missing originals and moved-out originals clear stale indexes without deleting outside folders',async()=>{
  for(const mode of ['missing','moved']){
    const f=fixture();if(mode==='missing')delete f.files.photo;else f.files.photo.parents=['unrelated-folder']
    await f.begin();await f.resume();assert.equal(f.db.tables.gallery_files.length,0);assert.equal(f.trashed.length,0)
  }
})
test('provider failures or changed files keep reset pending; retry continues saved work',async()=>{
  const f=fixture();await f.begin();f.setFailure('photo');await assert.rejects(f.resume(),/Some photos could not be cleared/)
  assert.equal(f.db.tables.gallery_files.length,1);f.setFailure('');assert.equal((await f.resume()).complete,true)
  const g=fixture();await g.begin();g.files.photo.parents=['moved'];await assert.rejects(g.resume(),/Some photos could not be cleared/);assert.equal(g.trashed.length,0)
})
test('foreign files, shared mappings and permission errors fail before starting a reset',async()=>{
  for(const mode of ['foreign','shared','permission']){
    const f=fixture();if(mode==='foreign')f.files.photo.appProperties={bookingId:'TWO'}
    if(mode==='shared')f.db.tables.drive_folders.push({booking_id:'TWO',drive_folder_id:'raw'})
    if(mode==='permission')f.setFailure('read:photo')
    await assert.rejects(f.begin());assert.equal(f.started,0);assert.equal(f.trashed.length,0)
  }
})
