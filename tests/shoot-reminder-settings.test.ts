import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { canManageShootReminders, shootReminderSettingsAction } from '../lib/shoot-reminder-settings.ts'

test('reminder settings accept only explicit actions and studio-admin access', () => {
  for (const action of ['check','enable','pause']) assert.equal(shootReminderSettingsAction.safeParse({action}).success,true)
  assert.equal(shootReminderSettingsAction.safeParse({action:'enable',url:'https://elsewhere.example'}).success,false)
  assert.equal(shootReminderSettingsAction.safeParse({action:'send_now'}).success,false)
  assert.equal(canManageShootReminders({workspaceSlug:'fico-mana',role:'admin'}),true)
  assert.equal(canManageShootReminders({workspaceSlug:'fico-mana',role:'editor'}),false)
  assert.equal(canManageShootReminders({workspaceSlug:'another-studio',role:'owner'}),false)
})

test('Admin reminder configuration runs against PostgreSQL with isolated external-service fixtures', async t => {
  const db = new PGlite({extensions:{pgcrypto}})
  t.after(()=>db.close())
  await db.exec(`
    create schema extensions; create extension pgcrypto with schema extensions;
    create role anon; create role authenticated; create role service_role bypassrls;
    create table workspaces(id uuid primary key,slug text,status text);
    create table workspace_members(workspace_id uuid,user_id uuid,role text);
    create table shoot_reminder_settings(id integer primary key,enabled boolean not null default false,
      worker_secret_hash text,last_started_at timestamptz,last_completed_at timestamptz,last_result jsonb);
    insert into shoot_reminder_settings(id) values(1);
    create schema cron; create schema vault; create schema net;
    create table cron.job(jobid bigserial primary key,jobname text,username text default current_user,
      schedule text,command text,active boolean default true,unique(jobname,username));
    create function cron.schedule(job_name text,schedule text,command text) returns bigint language sql as $$
      insert into cron.job(jobname,schedule,command) values(job_name,schedule,command)
      on conflict(jobname,username) do update set schedule=excluded.schedule,command=excluded.command returning jobid;
    $$;
    create function cron.alter_job(job_id bigint,active boolean) returns void language sql as $$
      update cron.job set active=$2 where jobid=job_id;
    $$;
    -- Fake Vault and HTTP queue exist only inside this test. Production uses the actual extensions.
    create table vault.decrypted_secrets(id uuid default gen_random_uuid(),name text unique,decrypted_secret text);
    create function vault.create_secret(secret text,name text,description text) returns uuid language sql as $$
      insert into vault.decrypted_secrets(name,decrypted_secret) values(name,secret) returning id;
    $$;
    create table net.test_requests(id bigserial primary key,url text,headers jsonb,body jsonb);
    create table net._http_response(id bigint,status_code integer,content text,error_msg text,timed_out boolean);
    create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language sql as $$
      insert into net.test_requests(url,headers,body) values(url,headers,body) returning id;
    $$;
    insert into workspaces values('00000000-0000-0000-0000-000000000001','fico-mana','active'),
      ('00000000-0000-0000-0000-000000000002','other-studio','active');
    insert into workspace_members values
      ('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','owner'),
      ('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','editor'),
      ('00000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','owner');
  `)
  const migration=await readFile('supabase/migrations/20260908070000_admin_shoot_reminder_controls.sql','utf8')
  await db.exec(migration.replace(/create extension if not exists (?:pg_cron|pg_net|supabase_vault);/g,''))
  const workspace='00000000-0000-0000-0000-000000000001'
  const owner='10000000-0000-0000-0000-000000000001'
  const query=async(sql:string,params:unknown[]=[]) => (await db.query<Record<string,unknown>>(sql,params)).rows
  const call=async(name:string,args:unknown[]=[workspace,owner]) =>
    (await query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as result`,args))[0].result as Record<string,unknown>
  const setEnabled=(enabled:boolean)=>call('set_shoot_reminders_enabled',[workspace,owner,enabled])
  const respondToProbe=async(status:number,content:string) => {
    await query('delete from net._http_response')
    await query('insert into net._http_response(id,status_code,content,timed_out) select readiness_request_id,$1,$2,false from shoot_reminder_settings where id=1',[status,content])
  }

  await t.test('migration alone does not create a secret, start a scheduler or enable emails', async()=> {
    const state=await call('get_shoot_reminder_control')
    assert.equal(state.enabled,false)
    assert.equal(state.configured,false)
    assert.equal(state.canActivate,false)
    assert.equal((await query('select * from cron.job')).length,0)
    assert.equal((await query('select * from vault.decrypted_secrets')).length,0)
    await assert.rejects(()=>setEnabled(true),/successful result/)
  })
  await t.test('service check configures one paused job, checks only the canonical endpoint and never exposes its key', async()=> {
    const state=await call('check_shoot_reminder_service')
    assert.equal(state.configured,true)
    assert.equal(state.enabled,false)
    assert.equal(state.schedulerActive,false)
    assert.equal(state.probeStatus,'checking')
    assert.equal(state.canActivate,false)
    const requests=await query('select url from net.test_requests')
    assert.deepEqual(requests,[{url:'https://www.ficomana.com/api/cron/shoot-reminders?dryRun=1'}])
    assert.equal((await query('select schedule from cron.job'))[0].schedule,'*/5 22-23 * * *')
    assert.doesNotMatch(JSON.stringify(state),/worker_secret|Bearer|decrypted|secret_hash/)
    await call('check_shoot_reminder_service')
    assert.equal((await query('select * from cron.job')).length,1)
    assert.equal((await query('select * from net.test_requests')).length,1)
  })
  await t.test('failed HTTP responses and malformed readiness content cannot unlock enable', async()=> {
    for (const [status,body] of [[503,'{"success":true,"dryRun":true}'],[200,'not json'],[200,'{"success":true}'],[200,'{"success":"true","dryRun":true}']] as const) {
      await respondToProbe(status,body)
      assert.equal((await call('get_shoot_reminder_control')).canActivate,false)
      await assert.rejects(()=>setEnabled(true),/successful result/)
    }
  })
  await t.test('verified enable and pause update both settings and scheduler atomically and write an audit trail', async()=> {
    await respondToProbe(200,'{"success":true,"dryRun":true}')
    assert.equal((await call('get_shoot_reminder_control')).canActivate,true)
    const enabled=await setEnabled(true)
    assert.equal(enabled.enabled,true)
    assert.equal(enabled.schedulerActive,true)
    assert.ok(enabled.lastVerifiedAt)
    assert.equal((await query('select * from net.test_requests')).length,1,'enabling must not send immediately')
    await respondToProbe(503,'{}')
    const paused=await setEnabled(false)
    assert.equal(paused.enabled,false)
    assert.equal(paused.schedulerActive,false)
    assert.deepEqual((await query('select action from shoot_reminder_control_audit order by created_at')).map(row=>row.action),['check','enable','pause'])
  })
  await t.test('stale probes cannot enable the schedule; a new check preserves an existing enabled state', async()=> {
    await respondToProbe(200,'{"success":true,"dryRun":true}')
    await query("update shoot_reminder_settings set readiness_started_at=now()-interval '11 minutes'")
    await assert.rejects(()=>setEnabled(true),/successful result/)
    await call('check_shoot_reminder_service')
    await respondToProbe(200,'{"success":true,"dryRun":true}')
    await setEnabled(true)
    await query("update shoot_reminder_settings set readiness_started_at=now()-interval '1 minute'")
    const checking=await call('check_shoot_reminder_service')
    assert.equal(checking.enabled,true)
    assert.equal(checking.schedulerActive,true)
    assert.equal((await query('select * from cron.job')).length,1)
    await setEnabled(false)
  })
  await t.test('editor, cross-workspace and direct client access are denied', async()=> {
    await assert.rejects(()=>call('check_shoot_reminder_service',[workspace,'10000000-0000-0000-0000-000000000002']),/Only a Fico Mana/)
    await assert.rejects(()=>call('get_shoot_reminder_control',['00000000-0000-0000-0000-000000000002',owner]),/Only a Fico Mana/)
    for (const role of ['anon','authenticated']) {
      await db.exec(`set role ${role}`)
      await assert.rejects(()=>call('get_shoot_reminder_control'),/permission denied/)
      await assert.rejects(()=>call('check_shoot_reminder_service'),/permission denied/)
      await assert.rejects(()=>setEnabled(true),/permission denied/)
      await db.exec('reset role')
    }
  })
})
