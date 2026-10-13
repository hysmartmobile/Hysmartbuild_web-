-- V1.3.1 production hardening: billing RLS consistency and usage enforcement primitives.
create or replace function public.get_company_usage(p_company_id uuid) returns jsonb
language sql security definer set search_path=public stable as $$
  select jsonb_build_object(
    'users', (select count(*) from company_members where company_id=p_company_id and status='ACTIVE'),
    'projects', (select count(*) from projects where company_id=p_company_id),
    'storage_mb', coalesce((select ceil(sum(size_bytes)::numeric/1048576) from documents where company_id=p_company_id),0)
  );
$$;
revoke all on function public.get_company_usage(uuid) from public,anon,authenticated;
grant execute on function public.get_company_usage(uuid) to service_role;

create or replace function public.enforce_company_limit(p_company_id uuid, p_resource text, p_increment integer default 1) returns boolean
language plpgsql security definer set search_path=public as $$
declare v_plan subscription_plans; v_usage jsonb; v_limit bigint; v_current bigint;
begin
  select sp.* into v_plan from company_subscriptions cs join subscription_plans sp on sp.id=cs.plan_id where cs.company_id=p_company_id and cs.status in ('TRIAL','ACTIVE','PAST_DUE') for update;
  if not found then return true; end if;
  v_usage := public.get_company_usage(p_company_id);
  if p_resource='users' then v_current := (v_usage->>'users')::bigint; v_limit := v_plan.max_users;
  elsif p_resource='projects' then v_current := (v_usage->>'projects')::bigint; v_limit := v_plan.max_projects;
  elsif p_resource='storage_mb' then v_current := (v_usage->>'storage_mb')::bigint; v_limit := v_plan.max_storage_mb;
  else raise exception 'UNKNOWN_USAGE_RESOURCE'; end if;
  if v_current + greatest(p_increment,0) > v_limit then raise exception 'SUBSCRIPTION_LIMIT_EXCEEDED' using errcode='P0001'; end if;
  return true;
end $$;
revoke all on function public.enforce_company_limit(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.enforce_company_limit(uuid,text,integer) to service_role;

-- Automatically provision a 14-day Starter trial for new companies after billing schema is installed.
create or replace function public.provision_company_trial() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_plan subscription_plans;
begin
  select * into v_plan from subscription_plans where code='STARTER' and active=true limit 1;
  if found then
    insert into company_subscriptions(company_id,plan_id,status,billing_interval,trial_ends_at,current_period_start,current_period_end)
    values(new.id,v_plan.id,'TRIAL','MONTHLY',now()+interval '14 days',now(),now()+interval '14 days')
    on conflict(company_id) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists companies_provision_trial on public.companies;
create trigger companies_provision_trial after insert on public.companies for each row execute function public.provision_company_trial();

insert into public.company_subscriptions(company_id,plan_id,status,billing_interval,trial_ends_at,current_period_start,current_period_end)
select c.id,p.id,'TRIAL','MONTHLY',now()+interval '14 days',now(),now()+interval '14 days'
from public.companies c cross join public.subscription_plans p
where p.code='STARTER' and p.active=true
  and not exists(select 1 from public.company_subscriptions cs where cs.company_id=c.id);
