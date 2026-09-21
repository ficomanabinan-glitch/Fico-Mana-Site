import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { loadTs } from './helpers/load-ts.ts'
import * as issues from '../lib/shoot-reminder-issues.ts'

const alerts = loadTs<typeof import('../lib/shoot-reminder-alerts.ts')>('lib/shoot-reminder-alerts.ts', {
  './shoot-reminder-issues': issues,
})

test('failure solutions are fixed, useful and never echo provider data', () => {
  for (const [reason, code] of [
    ['invalid_api_Key','email_setup'], ['restricted_api_key','sender'], ['rate_limit_exceeded','allowance'],
    ['daily_quota_exceeded','allowance'], ['monthly_quota_exceeded','allowance'], ['attendance','attendance'],
    ['https://private.example/token?secret=do-not-print','delivery'], [undefined,'delivery'],
  ] as const) {
    assert.equal(issues.reminderDeliveryIssue(reason),code)
    assert.match(issues.reminderIssue(code).message,/Try:/)
    assert.doesNotMatch(issues.reminderIssue(code).message,/do-not-print|private\.example/)
  }
  for (const code of Object.keys(issues.shootReminderIssues) as issues.ShootReminderIssueCode[]) {
    assert.match(issues.reminderIssue(code).message,/Try:/)
    assert.equal(issues.reminderRunIssue({errorCode:code})?.code,code)
  }
  for (const value of [null, {}, 'unsafe', {errorCode:'toString'}, {errorCode:'a secret'}]) assert.equal(issues.reminderRunIssue(value),null)
})

test('notifications deduplicate per issue per GMT+8 day without changing read state or sending emails', async () => {
  const now = new Date('2026-09-07T22:10:00Z')
  const first = alerts.reminderNotification('allowance',now)
  assert.match(first.id,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-8[a-f0-9]{3}-[a-f0-9]{12}$/)
  assert.equal(first.booking_id,null)
  assert.equal(first.type,'SHOOT_REMINDER_ERROR')
  assert.equal(first.id,alerts.reminderNotification('allowance',new Date('2026-09-08T03:00:00Z')).id)
  assert.notEqual(first.id,alerts.reminderNotification('sender',now).id)
  assert.notEqual(first.id,alerts.reminderNotification('allowance',new Date('2026-09-08T22:10:00Z')).id)
  const rows = new Map<string, typeof first>()
  const admin = { from(table:string) {
    assert.equal(table,'notifications')
    return { async upsert(row:typeof first, options:unknown) {
      assert.deepEqual(options,{onConflict:'id',ignoreDuplicates:true})
      if (!rows.has(row.id)) rows.set(row.id,row)
      return {error:null}
    } }
  } }
  await Promise.all(Array.from({length:5},()=>alerts.notifyShootReminderIssue(admin as never,'allowance',now)))
  rows.get(first.id)!.is_read = true
  await alerts.notifyShootReminderIssue(admin as never,'allowance',now)
  assert.equal(rows.size,1)
  assert.equal(rows.get(first.id)!.is_read,true)
})

test('missing scheduled checks respect the local window, manual disable and configuration grace period', () => {
  const settings = {enabled:true,updated_at:'2026-09-07T20:00:00Z',last_completed_at:null}
  for (const time of ['2026-09-07T21:59:00Z','2026-09-07T22:14:00Z']) {
    assert.equal(issues.reminderScheduleIsLate(settings,new Date(time)),false)
  }
  assert.equal(issues.reminderScheduleIsLate(settings,new Date('2026-09-07T22:16:00Z')),true)
  assert.equal(issues.reminderScheduleIsLate({...settings,enabled:false},new Date('2026-09-07T22:16:00Z')),false)
  assert.equal(issues.reminderScheduleIsLate({...settings,updated_at:'2026-09-07T22:10:00Z'},new Date('2026-09-07T22:16:00Z')),false)
  assert.equal(issues.reminderScheduleIsLate({...settings,last_completed_at:'2026-09-07T22:12:00Z'},new Date('2026-09-07T22:16:00Z')),false)
  assert.equal(issues.reminderScheduleIsLate({...settings,last_completed_at:'2026-09-07T23:55:00Z'},new Date('2026-09-08T04:00:00Z')),false)
  assert.equal(issues.reminderScheduleIsLate({...settings,last_completed_at:'2026-09-07T22:55:00Z'},new Date('2026-09-08T04:00:00Z')),true)
  assert.equal(issues.reminderScheduleIsLate({...settings,updated_at:'2026-09-08T04:00:00Z'},new Date('2026-09-08T04:20:00Z')),false)
})

function workerFixture(options: {provider?:string; network?:boolean; finishError?:boolean; claimError?:boolean; configured?:boolean; current?:boolean; notifyError?:boolean} = {}) {
  const mutations: Array<{table:string; value:Record<string,unknown>}> = []
  const finishes: Record<string,unknown>[] = []
  const sends: unknown[] = []
  const admin = {
    async rpc(name:string,args:Record<string,unknown>) {
      if (name === 'claim_shoot_reminders') return {error:options.claimError?{}:null,data:[{
        id:'synthetic-delivery',claim_token:'synthetic-claim',kind:'day_before',payload:{customerEmail:'client@example.com'},
      }]}
      if (name === 'shoot_reminder_is_current') return {error:null,data:options.current!==false}
      assert.equal(name,'finish_shoot_reminder')
      finishes.push(args)
      return {error:options.finishError?{}:null}
    },
    from(table:string) {
      return {
        async upsert(value:Record<string,unknown>) {mutations.push({table,value});return {error:options.notifyError?{}:null}},
        update(value:Record<string,unknown>) { mutations.push({table,value});return {async eq(){return {error:null}}} },
      }
    },
  }
  const worker = loadTs<typeof import('../lib/shoot-reminder-worker.ts')>('lib/shoot-reminder-worker.ts', {
    './shoot-reminder-content':{buildShootReminder(){return {subject:'synthetic',html:'synthetic',text:'synthetic'}}},
    './resend-config':{getResendFromAddress:()=> 'sender@example.com', getResendClient:()=>options.configured===false?null:{emails:{async send(payload:unknown,sendOptions:unknown){
      sends.push([payload,sendOptions])
      if (options.network) throw new Error('private-provider-response')
      return options.provider?{error:{name:options.provider},data:null}:{error:null,data:{id:'synthetic-accepted'}}
    }}}},
    './site-url':{getSiteUrl:()=> 'https://example.com'},
    './shoot-reminder-alerts':alerts,
    './shoot-reminder-issues':issues,
  })
  return {admin,mutations,finishes,sends,worker,run:()=>worker.runShootReminderWorker(admin as never)}
}

test('automatic delivery failure creates an actionable alert and never disables the schedule',async()=>{
  const fixture=workerFixture({provider:'rate_limit_exceeded'})
  const result=await fixture.run()
  assert.equal(result.failed,1)
  assert.equal(result.sent,0)
  assert.equal(fixture.finishes[0].p_status,'failed')
  assert.match(String(fixture.mutations.find(m=>m.table==='notifications')?.value.message),/Try: check the email allowance/)
  assert.equal(fixture.mutations.some(m=>'enabled' in m.value),false)
  assert.deepEqual((fixture.sends[0] as unknown[])[1],{idempotencyKey:'shoot-reminder/synthetic-delivery'})
})

test('success and declined/paused dispatch create no failure alert; alert storage failure never causes a second send',async()=>{
  for (const options of [{},{current:false},{provider:'validation_error',notifyError:true}]) {
    const fixture=workerFixture(options)
    const result=await fixture.run()
    assert.equal(fixture.sends.length,options.current===false?0:1)
    if (!options.provider) assert.equal(fixture.mutations.some(m=>m.table==='notifications'),false)
    else assert.equal(result.failed,1)
  }
})

test('queue, configuration and lost receipt errors persist safe run alerts, without marking accepted email failed',async()=>{
  for (const [options,code] of [[{configured:false},'email_setup'],[{claimError:true},'queue'],[{finishError:true},'receipt']] as const) {
    const fixture=workerFixture(options)
    let caught:unknown
    try { await fixture.run() } catch(error) { caught=error }
    assert.ok(caught instanceof alerts.ShootReminderRunError)
    assert.equal(caught.code,code)
    await alerts.recordShootReminderRunFailure(fixture.admin as never,caught)
    assert.equal(fixture.mutations.some(m=>'enabled' in m.value || 'last_completed_at' in m.value),false)
    assert.equal(fixture.finishes.some(f=>f.p_status==='failed'),false)
    assert.match(JSON.stringify(fixture.mutations),/Try:/)
  }
  const fixture=workerFixture({network:true})
  assert.equal((await fixture.run()).failed,1)
  assert.doesNotMatch(JSON.stringify(fixture.mutations),/private-provider-response/)
})

test('health query is workspace-scoped and keeps exhausted failures visible after an empty successful run',async()=>{
  const queries:unknown[]=[]
  const admin={from(table:string){
    const chain={
      select(...args:unknown[]){queries.push([table,'select',...args]);return chain},
      eq(...args:unknown[]){queries.push([table,'eq',...args]);return chain},
      order(){return chain},
      async single(){return {data:{enabled:true,last_result:{failed:0},updated_at:null},error:null}},
      async limit(){return {data:[{last_error:'invalid_api_key'}],count:3,error:null}},
    };return chain
  }}
  const result=await alerts.getShootReminderHealth(admin as never,'synthetic-workspace',new Date('2026-09-07T22:00:00Z'))
  assert.equal(result.failedToday,3)
  assert.equal(result.issue?.code,'email_setup')
  assert.ok(queries.some(q=>JSON.stringify(q)===JSON.stringify(['shoot_reminder_deliveries','eq','shoot_invitations.workspace_id','synthetic-workspace'])))
  assert.doesNotMatch(JSON.stringify(queries),/payload|customer_email|token/)
})

test('worker auth/probe boundaries and UI/API compatibility remain intact',()=>{
  const route=readFileSync('app/api/cron/shoot-reminders/route.ts','utf8')
  assert.ok(route.indexOf('if (error || !authorized)')<route.indexOf('recordShootReminderRunFailure(admin'))
  assert.match(route,/if \(!dryRun\) await recordShootReminderRunFailure/)
  const ui=readFileSync('components/shoot-reminder-settings.tsx','utf8')
  assert.doesNotMatch(ui,/unlocks Enable Reminders for 10 minutes/)
  assert.match(ui,/stay on until an administrator disables them/)
  assert.match(ui,/Enabled · Needs attention/)
  assert.match(ui,/Disable Reminders/)
  assert.match(ui,/apply\('pause'\)/)
  const notifications=readFileSync('app/api/notifications/route.ts','utf8')
  assert.match(notifications,/canManageShootReminders\(access\)/)
  assert.match(notifications,/reminderAdmin \|\| n.type !== SHOOT_REMINDER_NOTIFICATION_TYPE/)
  assert.match(notifications,/ignore|reserved/)
  assert.match(readFileSync('app/admin/layout.tsx','utf8'),/notificationDestination\(notification/)
  assert.match(readFileSync('lib/notification-navigation.ts','utf8'),/case 'SHOOT_REMINDER_ERROR':[\s\S]*?return '\/admin\/shoot-reminders'/)
})

test('system alerts satisfy the verified production booking foreign key without a fake client booking',async t=>{
  const db=new PGlite()
  t.after(()=>db.close())
  await db.exec(`create table bookings(id varchar(50) primary key);
    create table notifications(id uuid primary key,booking_id varchar(50) references bookings(id) on delete cascade,
      type varchar(50) not null,message text,is_read boolean,created_at timestamptz);`)
  const insert=async(code:issues.ShootReminderIssueCode)=>{
    const n=alerts.reminderNotification(code,new Date('2026-09-07T22:00:00Z'))
    await db.query('insert into notifications(id,booking_id,type,message,is_read,created_at) values($1,$2,$3,$4,$5,$6) on conflict(id) do nothing',
      [n.id,n.booking_id,n.type,n.message,n.is_read,n.created_at])
  }
  await insert('allowance')
  await db.exec('update notifications set is_read=true')
  await insert('allowance')
  await insert('queue')
  const rows=(await db.query<{booking_id:string|null;type:string;is_read:boolean}>('select booking_id,type,is_read from notifications order by created_at,id')).rows
  assert.equal(rows.length,2)
  assert.ok(rows.every(row=>row.booking_id===null&&row.type==='SHOOT_REMINDER_ERROR'))
  assert.equal(rows.filter(row=>row.is_read).length,1)
  assert.equal((await db.query('select * from bookings')).rows.length,0)
})
