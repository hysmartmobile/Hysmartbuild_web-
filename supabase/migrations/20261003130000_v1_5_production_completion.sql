-- HySmart Build V1.5 Production Completion / schema contract hardening
-- Safe to rerun. Canonical company billing identity uses billing_country/tax_country.
begin;

-- ---------------------------------------------------------------------------
-- Canonical global company identity
-- ---------------------------------------------------------------------------
alter table public.companies
  add column if not exists country_code text,
  add column if not exists billing_country text,
  add column if not exists tax_country text,
  add column if not exists currency_code text,
  add column if not exists locale text,
  add column if not exists timezone text,
  add column if not exists unit_system text default 'METRIC';

-- Compatibility with the earlier V1.4.3 draft column names.
alter table public.companies
  add column if not exists billing_country_code text,
  add column if not exists tax_country_code text;

update public.companies
set
  billing_country = coalesce(nullif(billing_country,''), nullif(billing_country_code,''), country_code),
  tax_country = coalesce(nullif(tax_country,''), nullif(tax_country_code,''), country_code),
  billing_country_code = coalesce(nullif(billing_country_code,''), nullif(billing_country,''), country_code),
  tax_country_code = coalesce(nullif(tax_country_code,''), nullif(tax_country,''), country_code),
  currency_code = coalesce(nullif(currency_code,''), case when country_code='NG' then 'NGN' else currency_code end),
  unit_system = coalesce(nullif(unit_system,''),'METRIC');

create or replace function public.sync_company_billing_identity()
returns trigger language plpgsql as $$
begin
  if new.billing_country is null then new.billing_country := new.billing_country_code; end if;
  if new.tax_country is null then new.tax_country := new.tax_country_code; end if;
  if new.billing_country is not null then new.billing_country_code := new.billing_country; end if;
  if new.tax_country is not null then new.tax_country_code := new.tax_country; end if;
  if new.unit_system is null then new.unit_system := 'METRIC'; end if;
  return new;
end;
$$;
drop trigger if exists companies_sync_billing_identity on public.companies;
create trigger companies_sync_billing_identity
before insert or update on public.companies
for each row execute function public.sync_company_billing_identity();

alter table public.companies drop constraint if exists companies_unit_system_check;
alter table public.companies add constraint companies_unit_system_check
  check (unit_system in ('METRIC','IMPERIAL'));

-- ---------------------------------------------------------------------------
-- Provider route schema normalization: active is the canonical flag.
-- ---------------------------------------------------------------------------
alter table public.payment_provider_routes
  add column if not exists active boolean default true;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='payment_provider_routes' and column_name='enabled'
  ) then
    update public.payment_provider_routes set active = coalesce(enabled,true);
  end if;
end $$;

update public.payment_provider_routes set active = true where active is null;
alter table public.payment_provider_routes alter column active set default true;
alter table public.payment_provider_routes alter column active set not null;


drop policy if exists payment_provider_routes_authenticated_read on public.payment_provider_routes;
create policy payment_provider_routes_authenticated_read on public.payment_provider_routes
for select to authenticated using (active=true);

create index if not exists payment_provider_routes_active_lookup_idx
  on public.payment_provider_routes(country_code,currency_code,active,priority);

-- ---------------------------------------------------------------------------
-- Provider-specific identifiers needed by the Stripe/global billing adapter.
-- ---------------------------------------------------------------------------
alter table public.subscription_plan_prices
  add column if not exists stripe_product_id text,
  add column if not exists stripe_monthly_price_id text,
  add column if not exists stripe_yearly_price_id text,
  add column if not exists paystack_monthly_plan_code text,
  add column if not exists paystack_yearly_plan_code text,
  add column if not exists flutterwave_monthly_plan_id bigint,
  add column if not exists flutterwave_yearly_plan_id bigint;

-- ---------------------------------------------------------------------------
-- Subscription lifecycle
-- ---------------------------------------------------------------------------
alter table public.company_subscriptions
  add column if not exists grace_period_ends_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancellation_reason text;

alter table public.company_subscriptions drop constraint if exists company_subscriptions_provider_check;
alter table public.company_subscriptions add constraint company_subscriptions_provider_check
  check (provider is null or provider in ('PAYSTACK','FLUTTERWAVE','STRIPE'));

alter table public.company_subscriptions drop constraint if exists company_subscriptions_status_check;
alter table public.company_subscriptions add constraint company_subscriptions_status_check
  check (status in ('TRIAL','ACTIVE','PAST_DUE','GRACE_PERIOD','SUSPENDED','CANCELLED','EXPIRED'));

alter table public.billing_transactions drop constraint if exists billing_transactions_provider_check;
alter table public.billing_transactions add constraint billing_transactions_provider_check
  check (provider in ('PAYSTACK','FLUTTERWAVE','STRIPE'));

alter table public.billing_webhook_events drop constraint if exists billing_webhook_events_provider_check;
alter table public.billing_webhook_events add constraint billing_webhook_events_provider_check
  check (provider in ('PAYSTACK','FLUTTERWAVE','STRIPE'));

-- ---------------------------------------------------------------------------
-- Billing customer abstraction
-- ---------------------------------------------------------------------------
create table if not exists public.billing_customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  provider text not null check (provider in ('PAYSTACK','FLUTTERWAVE','STRIPE')),
  provider_customer_id text not null,
  email text,
  name text,
  country_code text,
  currency_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, provider),
  unique(provider, provider_customer_id)
);
create index if not exists billing_customers_company_idx on public.billing_customers(company_id);

alter table public.billing_customers enable row level security;
drop policy if exists billing_customers_member_read on public.billing_customers;
create policy billing_customers_member_read on public.billing_customers
for select to authenticated
using (exists (
  select 1 from public.company_members m
  where m.company_id=billing_customers.company_id
    and m.user_id=auth.uid()
    and m.status='ACTIVE'
));

-- ---------------------------------------------------------------------------
-- Company-wide audit log
-- ---------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_company_created_idx
  on public.audit_logs(company_id, created_at desc);
create index if not exists audit_logs_entity_idx
  on public.audit_logs(entity_type, entity_id, created_at desc);
alter table public.audit_logs enable row level security;
drop policy if exists audit_logs_member_read on public.audit_logs;
create policy audit_logs_member_read on public.audit_logs
for select to authenticated
using (exists (
  select 1 from public.company_members m
  where m.company_id=audit_logs.company_id
    and m.user_id=auth.uid()
    and m.status='ACTIVE'
));

-- ---------------------------------------------------------------------------
-- Suppliers / procurement master data
-- ---------------------------------------------------------------------------
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  contact_name text,
  email text,
  phone text,
  address text,
  tax_id text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE','BLOCKED')),
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists suppliers_company_idx on public.suppliers(company_id,status,name);
alter table public.suppliers enable row level security;
drop policy if exists suppliers_member_read on public.suppliers;
create policy suppliers_member_read on public.suppliers for select to authenticated
using (exists (select 1 from public.company_members m where m.company_id=suppliers.company_id and m.user_id=auth.uid() and m.status='ACTIVE'));

-- ---------------------------------------------------------------------------
-- Daily report approval workflow
-- ---------------------------------------------------------------------------
alter table public.daily_site_reports
  add column if not exists approval_status text default 'PENDING',
  add column if not exists approved_by uuid references auth.users(id),
  add column if not exists approved_at timestamptz,
  add column if not exists rejection_reason text;

update public.daily_site_reports
set approval_status='PENDING'
where approval_status is null;

alter table public.daily_site_reports drop constraint if exists daily_site_reports_approval_status_check;
alter table public.daily_site_reports add constraint daily_site_reports_approval_status_check
  check (approval_status in ('PENDING','APPROVED','REJECTED'));

-- ---------------------------------------------------------------------------
-- Document lifecycle
-- ---------------------------------------------------------------------------
alter table public.documents
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id);

-- ---------------------------------------------------------------------------
-- Platform administration
-- ---------------------------------------------------------------------------
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
alter table public.platform_admins enable row level security;

create or replace function public.is_platform_admin(target_user uuid default auth.uid())
returns boolean
language sql
security definer stable set search_path=public as $$
  select exists(select 1 from public.platform_admins where user_id=target_user);
$$;

revoke all on function public.is_platform_admin(uuid) from public,anon,authenticated;
grant execute on function public.is_platform_admin(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Usage accounting: include private site-report photos as well as documents.
-- ---------------------------------------------------------------------------
create or replace function public.get_company_usage(p_company_id uuid)
returns jsonb language sql security definer stable set search_path=public as $$
  select jsonb_build_object(
    'users', (select count(*) from company_members where company_id=p_company_id and status='ACTIVE'),
    'projects', (select count(*) from projects where company_id=p_company_id),
    'storage_mb',
      coalesce((select ceil(sum(size_bytes)::numeric/1048576) from documents where company_id=p_company_id and deleted_at is null),0)
      + coalesce((select ceil(sum(file_size)::numeric/1048576) from site_report_photos where company_id=p_company_id),0)
  );
$$;
revoke all on function public.get_company_usage(uuid) from public,anon,authenticated;
grant execute on function public.get_company_usage(uuid) to service_role;

create or replace function public.enforce_company_limit(p_company_id uuid,p_resource text,p_increment integer default 1)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_plan public.subscription_plans; v_usage jsonb; v_limit bigint; v_current bigint;
begin
  select sp.* into v_plan
  from company_subscriptions cs
  join subscription_plans sp on sp.id=cs.plan_id
  where cs.company_id=p_company_id and cs.status in ('TRIAL','ACTIVE','PAST_DUE','GRACE_PERIOD')
    and (cs.status <> 'GRACE_PERIOD' or cs.grace_period_ends_at is null or cs.grace_period_ends_at > now())
  for update;
  if not found then
    raise exception 'SUBSCRIPTION_REQUIRED' using errcode='P0001';
  end if;

  v_usage := public.get_company_usage(p_company_id);
  if p_resource='users' then v_current := (v_usage->>'users')::bigint; v_limit := v_plan.max_users;
  elsif p_resource='projects' then v_current := (v_usage->>'projects')::bigint; v_limit := v_plan.max_projects;
  elsif p_resource='storage_mb' then v_current := (v_usage->>'storage_mb')::bigint; v_limit := v_plan.max_storage_mb;
  else raise exception 'UNKNOWN_USAGE_RESOURCE'; end if;

  if v_current + greatest(p_increment,0) > v_limit then
    raise exception 'SUBSCRIPTION_LIMIT_EXCEEDED' using errcode='P0001';
  end if;
  return true;
end;
$$;
revoke all on function public.enforce_company_limit(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.enforce_company_limit(uuid,text,integer) to service_role;


drop trigger if exists billing_customers_updated_at on public.billing_customers;
create trigger billing_customers_updated_at before update on public.billing_customers
for each row execute function public.set_updated_at();

drop trigger if exists suppliers_updated_at on public.suppliers;
create trigger suppliers_updated_at before update on public.suppliers
for each row execute function public.set_updated_at();


-- Complete the V1.4.3 market catalog for the remaining configured markets.
insert into public.billing_countries(country_code,name,currency_code,locale,timezone,unit_system)
values
('SA','Saudi Arabia','SAR','en-SA','Asia/Riyadh','METRIC'),
('NL','Netherlands','EUR','nl-NL','Europe/Amsterdam','METRIC'),
('ES','Spain','EUR','es-ES','Europe/Madrid','METRIC'),
('IT','Italy','EUR','it-IT','Europe/Rome','METRIC'),
('BR','Brazil','BRL','pt-BR','America/Sao_Paulo','METRIC')
on conflict(country_code) do update set
  name=excluded.name,currency_code=excluded.currency_code,locale=excluded.locale,
  timezone=excluded.timezone,unit_system=excluded.unit_system,active=true,updated_at=now();

with p(code,monthly,yearly) as (
  values ('STARTER',149::numeric,1490::numeric),('GROWTH',349::numeric,3490::numeric),('BUSINESS',499::numeric,4990::numeric)
), c(country_code,currency_code,fx) as (
  values ('SA','SAR',0.0024::numeric),('NL','EUR',0.00060::numeric),('ES','EUR',0.00060::numeric),
         ('IT','EUR',0.00060::numeric),('BR','BRL',0.0034::numeric)
)
insert into public.subscription_plan_prices(plan_id,country_code,currency_code,monthly_amount,yearly_amount,active)
select sp.id,c.country_code,c.currency_code,
       greatest(round(p.monthly*c.fx/5)*5,1),
       greatest(round(p.yearly*c.fx/5)*5,1),true
from p join public.subscription_plans sp on sp.code=p.code cross join c
on conflict(plan_id,country_code,currency_code) do update set
  monthly_amount=excluded.monthly_amount,yearly_amount=excluded.yearly_amount,active=true,updated_at=now();

insert into public.payment_provider_routes(country_code,currency_code,provider,priority,active)
values
('SA','SAR','STRIPE',10,true),
('NL','EUR','STRIPE',10,true),
('ES','EUR','STRIPE',10,true),
('IT','EUR','STRIPE',10,true),
('BR','BRL','STRIPE',10,true)
on conflict(country_code,currency_code,provider) do update set
  priority=excluded.priority,active=excluded.active,updated_at=now();

-- ---------------------------------------------------------------------------
-- Audit permissions
-- ---------------------------------------------------------------------------
insert into public.permissions(key,description) values
('audit:read','View company audit history'),
('supplier:create','Create suppliers'),
('supplier:read','Read suppliers'),
('supplier:update','Update suppliers'),
('supplier:delete','Delete suppliers')
on conflict(key) do update set description=excluded.description;

insert into public.role_permissions(role,permission_key)
values
('SUPER_ADMIN','audit:read'),
('COMPANY_OWNER','audit:read'),
('COMPANY_ADMIN','audit:read'),
('DIRECTOR','audit:read'),
('COMPANY_OWNER','supplier:create'),
('COMPANY_OWNER','supplier:read'),
('COMPANY_OWNER','supplier:update'),
('COMPANY_OWNER','supplier:delete'),
('COMPANY_ADMIN','supplier:create'),
('COMPANY_ADMIN','supplier:read'),
('COMPANY_ADMIN','supplier:update'),
('COMPANY_ADMIN','supplier:delete'),
('DIRECTOR','supplier:create'),
('DIRECTOR','supplier:read'),
('DIRECTOR','supplier:update'),
('STOREKEEPER','supplier:create'),
('STOREKEEPER','supplier:read'),
('STOREKEEPER','supplier:update')
on conflict do nothing;


-- Payment failures move an existing paid subscription into PAST_DUE with a
-- bounded grace period; a later verified payment returns it to ACTIVE.
create or replace function public.mark_billing_transaction_failed(p_provider text,p_reference text,p_status text)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_company uuid;
begin
  update billing_transactions
  set status=upper(p_status),updated_at=now()
  where provider=upper(p_provider) and reference=p_reference and status='PENDING'
  returning company_id into v_company;

  if v_company is not null then
    update company_subscriptions
    set status='PAST_DUE',
        grace_period_ends_at=coalesce(grace_period_ends_at, now()+interval '7 days'),
        updated_at=now()
    where company_id=v_company
      and status in ('ACTIVE','PAST_DUE','GRACE_PERIOD');
  end if;
  return v_company is not null;
end;
$$;
revoke execute on function public.mark_billing_transaction_failed(text,text,text) from public,anon,authenticated;
grant execute on function public.mark_billing_transaction_failed(text,text,text) to service_role;

commit;
