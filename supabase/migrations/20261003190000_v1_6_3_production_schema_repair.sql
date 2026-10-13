-- HySmart Build V1.6.3
-- Production schema repair / PostgREST relationship hardening.
-- Safe to run against databases that already contain V1.4.x-V1.6.x objects.
-- This migration does not delete business data.
--
-- Repairs:
-- 1. Canonical payment_provider_routes.active flag, including legacy enabled DBs.
-- 2. Invitation delivery columns + atomic manual-link acceptance function.
-- 3. Explicit membership/project -> profile relationships for PostgREST.
-- 4. Attendance tenant relationships and parent composite keys.
-- 5. Procurement/accounting tenant-safe composite foreign keys where the child
--    table carries company_id. Existing rows are not blocked by NOT VALID FKs;
--    all future writes are enforced.
-- 6. Updated_at triggers and RLS read policies for repaired V1.6 objects.

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Canonical global company identity columns.
-- ---------------------------------------------------------------------------
alter table public.companies
  add column if not exists country_code text,
  add column if not exists billing_country text,
  add column if not exists tax_country text,
  add column if not exists currency_code text,
  add column if not exists locale text,
  add column if not exists timezone text,
  add column if not exists unit_system text default 'METRIC';

alter table public.companies
  add column if not exists billing_country_code text,
  add column if not exists tax_country_code text;

update public.companies
set billing_country = coalesce(nullif(billing_country,''), nullif(billing_country_code,''), country_code),
    tax_country = coalesce(nullif(tax_country,''), nullif(tax_country_code,''), country_code),
    billing_country_code = coalesce(nullif(billing_country_code,''), nullif(billing_country,''), country_code),
    tax_country_code = coalesce(nullif(tax_country_code,''), nullif(tax_country,''), country_code),
    unit_system = coalesce(nullif(unit_system,''),'METRIC');

-- ---------------------------------------------------------------------------
-- 2. Payment provider route schema mismatch repair.
-- Older databases used enabled; V1.5+ uses active.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.payment_provider_routes') is not null then
    alter table public.payment_provider_routes add column if not exists active boolean default true;
    if exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='payment_provider_routes' and column_name='enabled'
    ) then
      update public.payment_provider_routes
      set active = coalesce(enabled, true);
    end if;
    update public.payment_provider_routes set active=true where active is null;
    alter table public.payment_provider_routes alter column active set default true;
    alter table public.payment_provider_routes alter column active set not null;
    create index if not exists payment_provider_routes_active_lookup_idx
      on public.payment_provider_routes(country_code,currency_code,active,priority);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Invitation schema repair for the manual copy/share link flow.
-- ---------------------------------------------------------------------------
create table if not exists public.company_invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  email text not null,
  role text not null check (role in ('COMPANY_ADMIN','DIRECTOR','PROJECT_MANAGER','SITE_ENGINEER','SITE_SUPERVISOR','ACCOUNTANT','STOREKEEPER','HR_MANAGER','WORKER','CLIENT')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  invited_by uuid not null references auth.users(id),
  accepted_at timestamptz,
  accepted_user_id uuid references auth.users(id),
  status text not null default 'PENDING' check (status in ('PENDING','ACCEPTED','EXPIRED','REVOKED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.company_invitations
  add column if not exists email_sent_at timestamptz,
  add column if not exists email_provider text,
  add column if not exists email_provider_message_id text,
  add column if not exists email_last_error text;

create index if not exists company_invitations_company_idx
  on public.company_invitations(company_id,status,created_at desc);
create index if not exists company_invitations_email_idx
  on public.company_invitations(lower(email),status);
create index if not exists company_invitations_pending_email_idx
  on public.company_invitations(lower(email),company_id,status,created_at desc);

alter table public.company_invitations enable row level security;

drop policy if exists company_invitations_member_read on public.company_invitations;
create policy company_invitations_member_read on public.company_invitations
for select to authenticated
using (public.is_company_member(company_id));

-- Atomic acceptance is intentionally service-role only because the API uses the
-- verified Supabase Auth identity and passes the normalized email into this RPC.
create or replace function public.accept_company_invitation(
  p_token_hash text,
  p_user_id uuid,
  p_email text
) returns public.company_invitations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.company_invitations;
  v_now timestamptz := now();
begin
  if p_user_id is null then
    raise exception 'AUTH_IDENTITY_REQUIRED' using errcode='42501';
  end if;

  select * into v_invite
  from public.company_invitations
  where token_hash = p_token_hash
  for update;

  if not found or v_invite.status <> 'PENDING' then
    raise exception 'INVITATION_INVALID' using errcode='P0001';
  end if;

  if v_invite.expires_at <= v_now then
    update public.company_invitations
    set status='EXPIRED', updated_at=v_now
    where id=v_invite.id;
    raise exception 'INVITATION_EXPIRED' using errcode='P0001';
  end if;

  if lower(v_invite.email) <> lower(coalesce(p_email,'')) then
    raise exception 'INVITATION_EMAIL_MISMATCH' using errcode='42501';
  end if;

  if exists (
    select 1 from public.company_members
    where company_id=v_invite.company_id and user_id=p_user_id and status='ACTIVE'
  ) then
    raise exception 'ALREADY_COMPANY_MEMBER' using errcode='23505';
  end if;

  perform public.enforce_company_limit(v_invite.company_id, 'users', 1);

  insert into public.company_members(company_id,user_id,role,status,created_at,updated_at)
  values(v_invite.company_id,p_user_id,v_invite.role,'ACTIVE',v_now,v_now)
  on conflict(company_id,user_id) do update
    set role=excluded.role,status='ACTIVE',updated_at=v_now;

  update public.company_invitations
  set status='ACCEPTED', accepted_at=v_now, accepted_user_id=p_user_id, updated_at=v_now
  where id=v_invite.id
  returning * into v_invite;

  return v_invite;
end;
$$;

revoke all on function public.accept_company_invitation(text,uuid,text) from public,anon,authenticated;
grant execute on function public.accept_company_invitation(text,uuid,text) to service_role;

-- ---------------------------------------------------------------------------
-- 4. PostgREST membership/project -> profile relationship repair.
-- The base tables also retain auth.users FKs; therefore application selects must
-- use these named profile relationships explicitly (V1.6.3 backend does so).
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.company_members') is not null
     and to_regclass('public.profiles') is not null
     and not exists (
       select 1 from pg_constraint
       where conname='company_members_user_profile_fk'
         and conrelid='public.company_members'::regclass
     ) then
    alter table public.company_members
      add constraint company_members_user_profile_fk
      foreign key(user_id) references public.profiles(id) on delete cascade;
  end if;

  if to_regclass('public.project_members') is not null
     and to_regclass('public.profiles') is not null
     and not exists (
       select 1 from pg_constraint
       where conname='project_members_user_profile_fk'
         and conrelid='public.project_members'::regclass
     ) then
    alter table public.project_members
      add constraint project_members_user_profile_fk
      foreign key(user_id) references public.profiles(id) on delete cascade;
  end if;
end $$;

insert into public.profiles(id,full_name)
select u.id, coalesce(nullif(u.raw_user_meta_data->>'full_name',''),'')
from auth.users u
left join public.profiles p on p.id=u.id
where p.id is null
on conflict(id) do nothing;

-- ---------------------------------------------------------------------------
-- 5. Attendance relationship repair.
-- Parent composite uniqueness is required by tenant-safe FKs. The existing direct
-- FKs remain valid; the backend no longer depends on ambiguous PostgREST embeds.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.projects') is not null and not exists (
    select 1 from pg_constraint where conname='projects_company_id_id_unique_v08' and conrelid='public.projects'::regclass
  ) then
    alter table public.projects add constraint projects_company_id_id_unique_v08 unique(company_id,id);
  end if;
  if to_regclass('public.sites') is not null and not exists (
    select 1 from pg_constraint where conname='sites_company_id_id_unique_v08' and conrelid='public.sites'::regclass
  ) then
    alter table public.sites add constraint sites_company_id_id_unique_v08 unique(company_id,id);
  end if;
  if to_regclass('public.workers') is not null and not exists (
    select 1 from pg_constraint where conname='workers_company_id_id_unique' and conrelid='public.workers'::regclass
  ) then
    alter table public.workers add constraint workers_company_id_id_unique unique(company_id,id);
  end if;
end $$;

do $$
begin
  if to_regclass('public.attendance_records') is not null and to_regclass('public.workers') is not null
     and not exists (select 1 from pg_constraint where conname='attendance_worker_tenant_fk' and conrelid='public.attendance_records'::regclass) then
    alter table public.attendance_records
      add constraint attendance_worker_tenant_fk
      foreign key(company_id,worker_id) references public.workers(company_id,id) on delete cascade not valid;
  end if;
  if to_regclass('public.attendance_records') is not null and to_regclass('public.projects') is not null
     and not exists (select 1 from pg_constraint where conname='attendance_project_tenant_fk' and conrelid='public.attendance_records'::regclass) then
    alter table public.attendance_records
      add constraint attendance_project_tenant_fk
      foreign key(company_id,project_id) references public.projects(company_id,id) on delete cascade not valid;
  end if;
  if to_regclass('public.attendance_records') is not null and to_regclass('public.sites') is not null
     and not exists (select 1 from pg_constraint where conname='attendance_site_tenant_fk' and conrelid='public.attendance_records'::regclass) then
    alter table public.attendance_records
      add constraint attendance_site_tenant_fk
      foreign key(company_id,site_id) references public.sites(company_id,id) on delete cascade not valid;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Procurement/accounting tenant-safe FKs.
-- These are NOT VALID so a legacy database containing inconsistent historical
-- rows can be repaired without losing availability. New inserts/updates are still
-- checked. After historical data is verified, operators may VALIDATE them.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  constraint_name text;
  duplicate_count bigint;
begin
  -- PostgreSQL requires the referenced (company_id,id) pair to be backed by
  -- a primary key or UNIQUE constraint. Use explicit constraints rather than
  -- relying on a pre-existing/non-constraint index from an older migration.
  foreach t in array array[
    'suppliers','purchase_requisitions','purchase_quotations','purchase_orders',
    'goods_received_notes','supplier_invoices','chart_of_accounts',
    'accounting_journals','accounts_receivable_invoices','payroll_runs',
    'bank_accounts','projects','sites','workers'
  ] loop
    if to_regclass('public.'||t) is not null
       and exists (select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='company_id')
       and exists (select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='id') then

      -- Skip when an existing PK/UNIQUE constraint already covers exactly
      -- (company_id,id).
      if not exists (
        select 1
        from pg_constraint c
        where c.conrelid=('public.'||t)::regclass
          and c.contype in ('p','u')
          and c.conkey = array[
            (select attnum from pg_attribute where attrelid=('public.'||t)::regclass and attname='company_id' and not attisdropped),
            (select attnum from pg_attribute where attrelid=('public.'||t)::regclass and attname='id' and not attisdropped)
          ]::smallint[]
      ) then
        execute format('select count(*) from (select company_id,id from public.%I group by company_id,id having count(*) > 1) d', t)
          into duplicate_count;
        if duplicate_count > 0 then
          raise exception 'V1_6_4_DUPLICATE_TENANT_KEYS: public.% has duplicate (company_id,id) rows; resolve duplicates before applying tenant FK repair', t;
        end if;
        constraint_name := t||'_company_id_id_unique_v164';
        execute format('alter table public.%I add constraint %I unique(company_id,id)', t, constraint_name);
      end if;
    end if;
  end loop;
end $$;

-- Add the parent-side tenant FKs only where both parent and child tables exist.
do $$
begin
  if to_regclass('public.purchase_quotations') is not null and not exists (select 1 from pg_constraint where conname='purchase_quotations_requisition_tenant_fk' and conrelid='public.purchase_quotations'::regclass) then
    alter table public.purchase_quotations add constraint purchase_quotations_requisition_tenant_fk
      foreign key(company_id,requisition_id) references public.purchase_requisitions(company_id,id) on delete restrict not valid;
  end if;
  if to_regclass('public.purchase_orders') is not null and to_regclass('public.suppliers') is not null and not exists (select 1 from pg_constraint where conname='purchase_orders_supplier_tenant_fk' and conrelid='public.purchase_orders'::regclass) then
    alter table public.purchase_orders add constraint purchase_orders_supplier_tenant_fk
      foreign key(company_id,supplier_id) references public.suppliers(company_id,id) on delete restrict not valid;
  end if;
  if to_regclass('public.purchase_orders') is not null and not exists (select 1 from pg_constraint where conname='purchase_orders_requisition_tenant_fk' and conrelid='public.purchase_orders'::regclass) then
    alter table public.purchase_orders add constraint purchase_orders_requisition_tenant_fk
      foreign key(company_id,requisition_id) references public.purchase_requisitions(company_id,id) on delete restrict not valid;
  end if;
  if to_regclass('public.purchase_orders') is not null and not exists (select 1 from pg_constraint where conname='purchase_orders_quotation_tenant_fk' and conrelid='public.purchase_orders'::regclass) then
    alter table public.purchase_orders add constraint purchase_orders_quotation_tenant_fk
      foreign key(company_id,quotation_id) references public.purchase_quotations(company_id,id) on delete restrict not valid;
  end if;
  if to_regclass('public.purchase_orders') is not null and to_regclass('public.projects') is not null and not exists (select 1 from pg_constraint where conname='purchase_orders_project_tenant_fk' and conrelid='public.purchase_orders'::regclass) then
    alter table public.purchase_orders add constraint purchase_orders_project_tenant_fk
      foreign key(company_id,project_id) references public.projects(company_id,id) on delete restrict not valid;
  end if;
  if to_regclass('public.purchase_orders') is not null and to_regclass('public.sites') is not null and not exists (select 1 from pg_constraint where conname='purchase_orders_site_tenant_fk' and conrelid='public.purchase_orders'::regclass) then
    alter table public.purchase_orders add constraint purchase_orders_site_tenant_fk
      foreign key(company_id,site_id) references public.sites(company_id,id) on delete restrict not valid;
  end if;
  if to_regclass('public.goods_received_notes') is not null and not exists (select 1 from pg_constraint where conname='grn_purchase_order_tenant_fk' and conrelid='public.goods_received_notes'::regclass) then
    alter table public.goods_received_notes add constraint grn_purchase_order_tenant_fk
      foreign key(company_id,purchase_order_id) references public.purchase_orders(company_id,id) on delete restrict not valid;
  end if;
  if to_regclass('public.supplier_invoices') is not null and to_regclass('public.suppliers') is not null and not exists (select 1 from pg_constraint where conname='supplier_invoices_supplier_tenant_fk' and conrelid='public.supplier_invoices'::regclass) then
    alter table public.supplier_invoices add constraint supplier_invoices_supplier_tenant_fk
      foreign key(company_id,supplier_id) references public.suppliers(company_id,id) on delete restrict not valid;
  end if;
  if to_regclass('public.supplier_invoices') is not null and not exists (select 1 from pg_constraint where conname='supplier_invoices_po_tenant_fk' and conrelid='public.supplier_invoices'::regclass) then
    alter table public.supplier_invoices add constraint supplier_invoices_po_tenant_fk
      foreign key(company_id,purchase_order_id) references public.purchase_orders(company_id,id) on delete restrict not valid;
  end if;
  if to_regclass('public.supplier_invoices') is not null and not exists (select 1 from pg_constraint where conname='supplier_invoices_grn_tenant_fk' and conrelid='public.supplier_invoices'::regclass) then
    alter table public.supplier_invoices add constraint supplier_invoices_grn_tenant_fk
      foreign key(company_id,grn_id) references public.goods_received_notes(company_id,id) on delete restrict not valid;
  end if;
  if to_regclass('public.supplier_payments') is not null and not exists (select 1 from pg_constraint where conname='supplier_payments_invoice_tenant_fk' and conrelid='public.supplier_payments'::regclass) then
    alter table public.supplier_payments add constraint supplier_payments_invoice_tenant_fk
      foreign key(company_id,supplier_invoice_id) references public.supplier_invoices(company_id,id) on delete restrict not valid;
  end if;
  if to_regclass('public.accounting_journals') is not null and to_regclass('public.projects') is not null and not exists (select 1 from pg_constraint where conname='accounting_journals_project_tenant_fk' and conrelid='public.accounting_journals'::regclass) then
    alter table public.accounting_journals add constraint accounting_journals_project_tenant_fk
      foreign key(company_id,project_id) references public.projects(company_id,id) on delete restrict not valid;
  end if;
  if to_regclass('public.accounts_receivable_payments') is not null and not exists (select 1 from pg_constraint where conname='ar_payments_invoice_tenant_fk' and conrelid='public.accounts_receivable_payments'::regclass) then
    alter table public.accounts_receivable_payments add constraint ar_payments_invoice_tenant_fk
      foreign key(company_id,invoice_id) references public.accounts_receivable_invoices(company_id,id) on delete restrict not valid;
  end if;
  if to_regclass('public.bank_transactions') is not null and not exists (select 1 from pg_constraint where conname='bank_transactions_account_tenant_fk' and conrelid='public.bank_transactions'::regclass) then
    alter table public.bank_transactions add constraint bank_transactions_account_tenant_fk
      foreign key(company_id,bank_account_id) references public.bank_accounts(company_id,id) on delete cascade not valid;
  end if;
  if to_regclass('public.payroll_items') is not null and not exists (select 1 from pg_constraint where conname='payroll_items_run_tenant_fk' and conrelid='public.payroll_items'::regclass) then
    alter table public.payroll_items add constraint payroll_items_run_tenant_fk
      foreign key(company_id,payroll_run_id) references public.payroll_runs(company_id,id) on delete cascade not valid;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 7. V1.6 updated_at triggers.
-- ---------------------------------------------------------------------------
create or replace function public.touch_v1_6_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at=now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'purchase_requisitions','purchase_quotations','purchase_orders',
    'goods_received_notes','supplier_invoices','chart_of_accounts','cost_codes',
    'accounting_journals','accounts_receivable_invoices','payroll_runs',
    'company_invitations'
  ] loop
    if to_regclass('public.'||t) is not null then
      execute format('drop trigger if exists %I on public.%I', 'touch_'||t, t);
      execute format('create trigger %I before update on public.%I for each row execute function public.touch_v1_6_updated_at()', 'touch_'||t, t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Repair canonical active provider RLS.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.payment_provider_routes') is not null then
    alter table public.payment_provider_routes enable row level security;
    drop policy if exists payment_provider_routes_authenticated_read on public.payment_provider_routes;
    create policy payment_provider_routes_authenticated_read on public.payment_provider_routes
      for select to authenticated using (active=true);
  end if;
end $$;

commit;

-- Refresh PostgREST's relationship/schema cache immediately.
notify pgrst, 'reload schema';
