import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { addonPhotoError, addonPhotoLimit } from '../lib/addon-photo-rules.ts'

test('catalog photo limits govern frame, wallet, 4R, A4 and nonphysical add-ons', () => {
  for (const [name, limit] of [['11×14 Frame',1],['8R Frame',1],['A4 Size Printed',1],['4 pcs Wallet Size',4],['2 pcs 4R Size',2],['Extra Edit',0]] as const) assert.equal(addonPhotoLimit({name}),limit)
  assert.equal(addonPhotoLimit({name:'8R Frame',photoLimit:2}),2)
  assert.equal(addonPhotoError({name:'8R Frame'},['included'],['included','extra']),null)
  assert.equal(addonPhotoError({name:'8R Frame'},['extra'],['included','extra']),null)
  assert.match(addonPhotoError({name:'8R Frame'},[],['included'])!,/Choose/)
})

test('SQL assignment guard rejects duplicate and cross-booking IDs while retaining historical unassigned orders', async t => {
  const db=new PGlite();t.after(()=>db.close())
  const workspace='00000000-0000-4000-8000-000000000001', selected='00000000-0000-4000-8000-000000000002', photo='00000000-0000-4000-8000-000000000003', foreign='00000000-0000-4000-8000-000000000004'
  await db.exec(`create table addon_catalog(id uuid,name text);
    create table client_addon_orders(workspace_id uuid,booking_id text,selection_id uuid);
    create table gallery_files(id uuid,workspace_id uuid,booking_id text);
    create table photo_selection_items(selection_id uuid,gallery_file_id uuid);
    insert into gallery_files values('${photo}','${workspace}','A'),('${foreign}','${workspace}','B');
    insert into photo_selection_items values('${selected}','${photo}'),('${selected}','${foreign}');`)
  await db.exec(readFileSync('supabase/migrations/20260909005547_portal_addon_photo_assignments.sql','utf8'))
  const insert=(ids:string[])=>db.query('insert into client_addon_orders values($1,$2,$3,$4::uuid[])',[workspace,'A',selected,ids])
  await insert([]);await insert([photo])
  await assert.rejects(insert([foreign]),/same booking/)
  await assert.rejects(insert([photo,photo]),/unique selected/)
  assert.equal((await db.query('select * from client_addon_orders')).rows.length,2)
})
