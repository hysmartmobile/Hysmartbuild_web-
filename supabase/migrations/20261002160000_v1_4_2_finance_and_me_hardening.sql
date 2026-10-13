-- HySmart Build V1.4.2
-- Finance tenant-FK/RLS hardening + safe profile resolution for /api/v1/me.
-- This migration is designed to be safe on a database where V0.9 may have
-- been partially/apparently applied. It does not drop business data.

-- ---------------------------------------------------------------------------
-- 1. Required composite uniqueness for tenant-scoped foreign keys.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'projects_company_id_id_unique_v09'
      and conrelid = 'public.projects'::regclass
  ) then
    alter table public.projects
      add constraint projects_company_id_id_unique_v09 unique (company_id, id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sites_company_id_id_unique_v09'
      and conrelid = 'public.sites'::regclass
  ) then
    alter table public.sites
      add constraint sites_company_id_id_unique_v09 unique (company_id, id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'expenses_company_id_id_unique_v09'
      and conrelid = 'public.expenses'::regclass
  ) then
    alter table public.expenses
      add constraint expenses_company_id_id_unique_v09 unique (company_id, id);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Tenant-safe composite foreign keys. Add only when absent.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'expenses_project_tenant_fk'
      and conrelid = 'public.expenses'::regclass
  ) then
    alter table public.expenses
      add constraint expenses_project_tenant_fk
      foreign key (company_id, project_id)
      references public.projects(company_id, id)
      on delete set null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'expenses_site_tenant_fk'
      and conrelid = 'public.expenses'::regclass
  ) then
    alter table public.expenses
      add constraint expenses_site_tenant_fk
      foreign key (company_id, site_id)
      references public.sites(company_id, id)
      on delete set null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'expense_approvals_expense_tenant_fk'
      and conrelid = 'public.expense_approvals'::regclass
  ) then
    alter table public.expense_approvals
      add constraint expense_approvals_expense_tenant_fk
      foreign key (company_id, expense_id)
      references public.expenses(company_id, id)
      on delete cascade;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'financial_records_project_tenant_fk'
      and conrelid = 'public.financial_records'::regclass
  ) then
    alter table public.financial_records
      add constraint financial_records_project_tenant_fk
      foreign key (company_id, project_id)
      references public.projects(company_id, id)
      on delete set null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'financial_records_site_tenant_fk'
      and conrelid = 'public.financial_records'::regclass
  ) then
    alter table public.financial_records
      add constraint financial_records_site_tenant_fk
      foreign key (company_id, site_id)
      references public.sites(company_id, id)
      on delete set null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'financial_records_expense_tenant_fk'
      and conrelid = 'public.financial_records'::regclass
  ) then
    alter table public.financial_records
      add constraint financial_records_expense_tenant_fk
      foreign key (company_id, expense_id)
      references public.expenses(company_id, id)
      on delete set null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Permission helper used by SECURITY DEFINER finance RPCs and RLS.
-- ---------------------------------------------------------------------------
create or replace function public.has_company_permission(
  target_company uuid,
  target_permission text
) returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.company_members cm
    join public.role_permissions rp on rp.role = cm.role
    where cm.company_id = target_company
      and cm.user_id = auth.uid()
      and cm.status = 'ACTIVE'
      and rp.permission_key = target_permission
  );
$$;

revoke all on function public.has_company_permission(uuid, text) from public, anon;
grant execute on function public.has_company_permission(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Financial RLS: permission-specific instead of member-wide CRUD.
-- ---------------------------------------------------------------------------
alter table public.expenses enable row level security;
alter table public.expense_approvals enable row level security;
alter table public.financial_records enable row level security;

drop policy if exists expenses_member_all on public.expenses;
drop policy if exists expenses_select_permission on public.expenses;
drop policy if exists expenses_insert_permission on public.expenses;
drop policy if exists expenses_update_permission on public.expenses;
drop policy if exists expenses_delete_permission on public.expenses;

create policy expenses_select_permission
on public.expenses
for select to authenticated
using (public.has_company_permission(company_id, 'expense:read'));

create policy expenses_insert_permission
on public.expenses
for insert to authenticated
with check (public.has_company_permission(company_id, 'expense:create'));

create policy expenses_update_permission
on public.expenses
for update to authenticated
using (public.has_company_permission(company_id, 'expense:create'))
with check (public.has_company_permission(company_id, 'expense:create'));

-- No direct DELETE policy: expense deletion is intentionally not exposed.

drop policy if exists expense_approvals_member_all on public.expense_approvals;
drop policy if exists expense_approvals_select_permission on public.expense_approvals;
drop policy if exists expense_approvals_insert_permission on public.expense_approvals;

create policy expense_approvals_select_permission
on public.expense_approvals
for select to authenticated
using (public.has_company_permission(company_id, 'expense:read'));

-- Approval records are written by the SECURITY DEFINER approval RPC only.
-- No direct authenticated INSERT policy is granted.

drop policy if exists financial_records_member_all on public.financial_records;
drop policy if exists financial_records_select_permission on public.financial_records;
drop policy if exists financial_records_insert_permission on public.financial_records;
drop policy if exists financial_records_update_permission on public.financial_records;

create policy financial_records_select_permission
on public.financial_records
for select to authenticated
using (public.has_company_permission(company_id, 'finance:read'));

create policy financial_records_insert_permission
on public.financial_records
for insert to authenticated
with check (public.has_company_permission(company_id, 'finance:create'));

-- Financial records are append-only from the application surface.

-- ---------------------------------------------------------------------------
-- 5. Harden approval RPC: identity, membership and permission are all checked
-- inside the database transaction.
-- ---------------------------------------------------------------------------
create or replace function public.approve_expense(
  p_company_id uuid,
  p_expense_id uuid,
  p_user_id uuid,
  p_decision text,
  p_reason text default null
) returns public.expenses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expense public.expenses;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'AUTH_IDENTITY_MISMATCH' using errcode='42501';
  end if;

  if not public.has_company_permission(p_company_id, 'expense:approve') then
    raise exception 'EXPENSE_APPROVAL_PERMISSION_DENIED' using errcode='42501';
  end if;

  if p_decision not in ('APPROVED','REJECTED') then
    raise exception 'INVALID_DECISION' using errcode='22023';
  end if;

  select * into v_expense
  from public.expenses
  where company_id = p_company_id
    and id = p_expense_id
  for update;

  if not found then
    raise exception 'EXPENSE_NOT_FOUND' using errcode='P0002';
  end if;

  if v_expense.status <> 'PENDING' then
    raise exception 'EXPENSE_NOT_PENDING' using errcode='55000';
  end if;

  update public.expenses
  set status = p_decision,
      approved_by = p_user_id,
      approved_at = now(),
      rejection_reason = case
        when p_decision = 'REJECTED' then nullif(trim(p_reason), '')
        else null
      end,
      updated_at = now()
  where company_id = p_company_id
    and id = p_expense_id
  returning * into v_expense;

  insert into public.expense_approvals(
    id, company_id, expense_id, actor_user_id, decision, reason
  ) values (
    gen_random_uuid(),
    p_company_id,
    p_expense_id,
    p_user_id,
    p_decision,
    nullif(trim(p_reason), '')
  );

  return v_expense;
end;
$$;

revoke all on function public.approve_expense(uuid,uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.approve_expense(uuid,uuid,uuid,text,text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Harden payment RPC and make payment creation atomic.
-- ---------------------------------------------------------------------------
create or replace function public.mark_expense_paid(
  p_company_id uuid,
  p_expense_id uuid,
  p_user_id uuid,
  p_reference text default null
) returns public.expenses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expense public.expenses;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'AUTH_IDENTITY_MISMATCH' using errcode='42501';
  end if;

  if not public.has_company_permission(p_company_id, 'expense:pay') then
    raise exception 'EXPENSE_PAYMENT_PERMISSION_DENIED' using errcode='42501';
  end if;

  select * into v_expense
  from public.expenses
  where company_id = p_company_id
    and id = p_expense_id
  for update;

  if not found then
    raise exception 'EXPENSE_NOT_FOUND' using errcode='P0002';
  end if;

  if v_expense.status <> 'APPROVED' then
    raise exception 'EXPENSE_NOT_APPROVED' using errcode='55000';
  end if;

  update public.expenses
  set status = 'PAID',
      updated_at = now()
  where company_id = p_company_id
    and id = p_expense_id
  returning * into v_expense;

  insert into public.financial_records(
    id, company_id, project_id, site_id, expense_id,
    record_type, reference, description, amount, currency,
    record_date, recorded_by
  ) values (
    gen_random_uuid(),
    p_company_id,
    v_expense.project_id,
    v_expense.site_id,
    v_expense.id,
    'PAYMENT',
    nullif(trim(p_reference), ''),
    v_expense.description,
    v_expense.amount,
    v_expense.currency,
    current_date,
    p_user_id
  );

  return v_expense;
end;
$$;

revoke all on function public.mark_expense_paid(uuid,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.mark_expense_paid(uuid,uuid,uuid,text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Ensure the V0.9 finance permissions exist and retain their intended roles.
-- ---------------------------------------------------------------------------
insert into public.permissions(key, description) values
  ('expense:create','Create expense records'),
  ('expense:read','Read expense and financial records'),
  ('expense:approve','Approve or reject pending expenses'),
  ('expense:pay','Mark approved expenses as paid'),
  ('finance:create','Create financial records'),
  ('finance:read','Read financial records')
on conflict (key) do update set description = excluded.description;

-- Only change these six finance permissions. Existing unrelated permissions remain untouched.
delete from public.role_permissions
where permission_key in (
  'expense:create','expense:read','expense:approve',
  'expense:pay','finance:create','finance:read'
);

insert into public.role_permissions(role, permission_key) values
  ('SUPER_ADMIN','expense:create'),('SUPER_ADMIN','expense:read'),('SUPER_ADMIN','expense:approve'),('SUPER_ADMIN','expense:pay'),('SUPER_ADMIN','finance:create'),('SUPER_ADMIN','finance:read'),
  ('COMPANY_OWNER','expense:create'),('COMPANY_OWNER','expense:read'),('COMPANY_OWNER','expense:approve'),('COMPANY_OWNER','expense:pay'),('COMPANY_OWNER','finance:create'),('COMPANY_OWNER','finance:read'),
  ('COMPANY_ADMIN','expense:create'),('COMPANY_ADMIN','expense:read'),('COMPANY_ADMIN','expense:approve'),('COMPANY_ADMIN','expense:pay'),('COMPANY_ADMIN','finance:create'),('COMPANY_ADMIN','finance:read'),
  ('DIRECTOR','expense:create'),('DIRECTOR','expense:read'),('DIRECTOR','expense:approve'),('DIRECTOR','expense:pay'),('DIRECTOR','finance:create'),('DIRECTOR','finance:read'),
  ('ACCOUNTANT','expense:create'),('ACCOUNTANT','expense:read'),('ACCOUNTANT','expense:approve'),('ACCOUNTANT','expense:pay'),('ACCOUNTANT','finance:create'),('ACCOUNTANT','finance:read'),
  ('PROJECT_MANAGER','expense:create'),('PROJECT_MANAGER','expense:read'),('PROJECT_MANAGER','finance:read'),
  ('SITE_ENGINEER','expense:create'),('SITE_ENGINEER','expense:read'),
  ('SITE_SUPERVISOR','expense:create'),('SITE_SUPERVISOR','expense:read')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 8. Existing Auth users may predate the profile trigger. Backfill only missing
-- profiles so /api/v1/me has a deterministic one-row profile.
-- ---------------------------------------------------------------------------
insert into public.profiles(id, full_name)
select u.id, coalesce(u.raw_user_meta_data ->> 'full_name', '')
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

-- ---------------------------------------------------------------------------
-- 9. Supporting indexes.
-- ---------------------------------------------------------------------------
create index if not exists expenses_company_created_idx
  on public.expenses(company_id, created_at desc);

create index if not exists financial_records_company_type_date_idx
  on public.financial_records(company_id, record_type, record_date desc);

create index if not exists expense_approvals_company_created_idx
  on public.expense_approvals(company_id, created_at desc);
