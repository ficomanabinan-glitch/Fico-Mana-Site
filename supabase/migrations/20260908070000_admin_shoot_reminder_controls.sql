begin;

-- One-time infrastructure install. Daily setup, checks and enable/pause live in Admin.
-- Installing this migration does not create a credential or enable any emails.
create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault;

alter table public.shoot_reminder_settings
  add column if not exists readiness_request_id bigint,
  add column if not exists readiness_started_at timestamptz,
  add column if not exists readiness_verified_at timestamptz,
  add column if not exists updated_at timestamptz,
  add column if not exists updated_by uuid;

create table if not exists public.shoot_reminder_control_audit (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  actor_id uuid not null,
  action text not null check (action in ('check','enable','pause')),
  created_at timestamptz not null default now()
);
alter table public.shoot_reminder_control_audit enable row level security;
revoke all on public.shoot_reminder_control_audit from public,anon,authenticated;
grant all on public.shoot_reminder_control_audit to service_role;

create or replace function public.assert_shoot_reminder_admin(p_workspace uuid,p_actor uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from public.workspace_members m join public.workspaces w on w.id=m.workspace_id
    where m.workspace_id=p_workspace and m.user_id=p_actor and m.role in ('owner','admin')
      and w.slug='fico-mana' and w.status='active') then
    raise exception 'Only a Fico Mana workspace administrator can configure reminders.' using errcode='42501';
  end if;
end;
$$;

-- Fixed destination and cadence: callers cannot inject arbitrary SQL or URLs.
create or replace function public.shoot_reminder_cron_command()
returns text language sql immutable set search_path=pg_catalog as $function$
  select $command$select net.http_post(
    url:='https://www.ficomana.com/api/cron/shoot-reminders',
    headers:=jsonb_build_object('Content-Type','application/json','Authorization',
      'Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='fico_shoot_reminder_worker')),
    body:='{}'::jsonb,timeout_milliseconds:=120000
  );$command$;
$function$;

create or replace function public.shoot_reminder_probe_ok(p_status integer,p_content text,p_error text,p_timeout boolean)
returns boolean language plpgsql immutable set search_path=pg_catalog as $$
declare body jsonb;
begin
  if p_status is distinct from 200 or p_error is not null or coalesce(p_timeout,false) then return false; end if;
  body := p_content::jsonb;
  return coalesce(body->'success'='true'::jsonb and body->'dryRun'='true'::jsonb,false);
exception when others then return false;
end;
$$;

create or replace function public.get_shoot_reminder_control(p_workspace uuid,p_actor uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  settings public.shoot_reminder_settings;
  job cron.job;
  probe net._http_response;
  configured boolean;
  probe_status text := 'not_checked';
  problem text;
begin
  perform public.assert_shoot_reminder_admin(p_workspace,p_actor);
  select * into strict settings from public.shoot_reminder_settings where id=1;
  select * into job from cron.job where jobname='fico-shoot-reminders' and username=current_user;
  select * into probe from net._http_response where id=settings.readiness_request_id;
  configured := settings.worker_secret_hash is not null and job.jobid is not null
    and job.schedule='*/5 22-23 * * *' and job.command=public.shoot_reminder_cron_command();
  if settings.readiness_started_at is not null then
    if public.shoot_reminder_probe_ok(probe.status_code,probe.content,probe.error_msg,probe.timed_out) then
      probe_status := 'ready';
    elsif probe.id is null and settings.readiness_started_at>now()-interval '90 seconds' then
      probe_status := 'checking';
    else
      probe_status := 'failed';
      problem := 'The reminder service did not pass its check. Try: Check Reminder Service again; if it still fails, verify the production email configuration.';
    end if;
  end if;
  return jsonb_build_object('enabled',settings.enabled,'configured',configured,
    'schedulerActive',coalesce(job.active,false),'probeStatus',probe_status,
    'checkedAt',settings.readiness_started_at,'lastVerifiedAt',settings.readiness_verified_at,
    'canActivate',configured and probe_status='ready' and settings.readiness_started_at>now()-interval '10 minutes',
    'problem',problem,'lastCompletedAt',settings.last_completed_at,
    'updatedAt',settings.updated_at,'timeZone','Asia/Manila','sendTime','06:00',
    'firstReminderDaysBefore',1,'morningRule','confirmed_or_no_response_after_first_email');
end;
$$;

create or replace function public.check_shoot_reminder_service(p_workspace uuid,p_actor uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare settings public.shoot_reminder_settings; worker_secret text; task_id bigint; request_id bigint;
begin
  perform public.assert_shoot_reminder_admin(p_workspace,p_actor);
  select * into strict settings from public.shoot_reminder_settings where id=1 for update;
  -- Serialize button clicks and reuse an in-flight request, never duplicate the scheduler.
  if settings.readiness_started_at>now()-interval '15 seconds' then
    return public.get_shoot_reminder_control(p_workspace,p_actor);
  end if;
  select decrypted_secret into worker_secret from vault.decrypted_secrets where name='fico_shoot_reminder_worker';
  if worker_secret is null then
    worker_secret := encode(extensions.gen_random_bytes(32),'hex');
    perform vault.create_secret(worker_secret,'fico_shoot_reminder_worker','Internal FICO MANA reminder scheduler credential');
  end if;
  update public.shoot_reminder_settings
    set worker_secret_hash=encode(extensions.digest(worker_secret,'sha256'),'hex') where id=1;
  task_id := cron.schedule('fico-shoot-reminders','*/5 22-23 * * *',public.shoot_reminder_cron_command());
  -- Checking an already-enabled service must not unexpectedly pause it.
  perform cron.alter_job(task_id,active:=settings.enabled);
  request_id := net.http_post(
    url:='https://www.ficomana.com/api/cron/shoot-reminders?dryRun=1',
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||worker_secret),
    body:='{}'::jsonb,timeout_milliseconds:=30000
  );
  update public.shoot_reminder_settings set readiness_request_id=request_id,readiness_started_at=now(),
    updated_at=now(),updated_by=p_actor where id=1;
  insert into public.shoot_reminder_control_audit(workspace_id,actor_id,action) values(p_workspace,p_actor,'check');
  return public.get_shoot_reminder_control(p_workspace,p_actor);
end;
$$;

create or replace function public.set_shoot_reminders_enabled(p_workspace uuid,p_actor uuid,p_enabled boolean)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare settings public.shoot_reminder_settings; control jsonb; task_id bigint;
begin
  if p_enabled is null then raise exception 'Choose enable or pause.'; end if;
  perform public.assert_shoot_reminder_admin(p_workspace,p_actor);
  select * into strict settings from public.shoot_reminder_settings where id=1 for update;
  control := public.get_shoot_reminder_control(p_workspace,p_actor);
  if p_enabled and not coalesce((control->>'canActivate')::boolean,false) then
    raise exception 'Run Check Reminder Service and wait for a successful result before enabling reminders.' using errcode='22023';
  end if;
  select jobid into task_id from cron.job where jobname='fico-shoot-reminders' and username=current_user;
  update public.shoot_reminder_settings set enabled=p_enabled,updated_at=now(),updated_by=p_actor,
    readiness_verified_at=case when p_enabled then now() else readiness_verified_at end where id=1;
  if task_id is not null then perform cron.alter_job(task_id,active:=p_enabled); end if;
  insert into public.shoot_reminder_control_audit(workspace_id,actor_id,action)
    values(p_workspace,p_actor,case when p_enabled then 'enable' else 'pause' end);
  return public.get_shoot_reminder_control(p_workspace,p_actor);
end;
$$;

revoke all on function public.assert_shoot_reminder_admin(uuid,uuid),public.shoot_reminder_cron_command(),
  public.shoot_reminder_probe_ok(integer,text,text,boolean),public.get_shoot_reminder_control(uuid,uuid),
  public.check_shoot_reminder_service(uuid,uuid),public.set_shoot_reminders_enabled(uuid,uuid,boolean)
  from public,anon,authenticated;
grant execute on function public.get_shoot_reminder_control(uuid,uuid),
  public.check_shoot_reminder_service(uuid,uuid),public.set_shoot_reminders_enabled(uuid,uuid,boolean) to service_role;
notify pgrst,'reload schema';
commit;
