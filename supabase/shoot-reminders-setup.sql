-- Run AFTER the shoot-reminder migration and production deployment.
-- This installs a paused job and submits ONLY a no-email readiness probe.
begin;
create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault;

do $$
declare worker_secret text;
begin
  select decrypted_secret into worker_secret from vault.decrypted_secrets where name='fico_shoot_reminder_worker';
  if worker_secret is null then
    worker_secret := encode(extensions.gen_random_bytes(32),'hex');
    perform vault.create_secret(worker_secret,'fico_shoot_reminder_worker','Internal FICO MANA reminder scheduler credential');
  end if;
  update public.shoot_reminder_settings set enabled=false,
    worker_secret_hash=encode(extensions.digest(worker_secret,'sha256'),'hex') where id=1;
end;
$$;

select cron.schedule('fico-shoot-reminders','*/5 22-23 * * *',$job$
  select net.http_post(
    url:='https://www.ficomana.com/api/cron/shoot-reminders',
    headers:=jsonb_build_object('Content-Type','application/json','Authorization',
      'Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='fico_shoot_reminder_worker')),
    body:='{}'::jsonb,timeout_milliseconds:=120000
  );
$job$);
select cron.alter_job(jobid,active:=false) from cron.job where jobname='fico-shoot-reminders';
commit;

-- Only this small, dedicated internal key is sent to our own production endpoint.
-- The existing Supabase service key and Resend API key are never put in cron text.
select net.http_post(
  url:='https://www.ficomana.com/api/cron/shoot-reminders?dryRun=1',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization',
    'Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='fico_shoot_reminder_worker')),
  body:='{}'::jsonb,timeout_milliseconds:=30000
) as readiness_request_id;
