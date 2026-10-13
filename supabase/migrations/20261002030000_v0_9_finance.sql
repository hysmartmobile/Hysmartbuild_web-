-- HySmart Build V0.9: Expenses, approvals and financial records
create table if not exists public.expenses (
  id uuid primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid,
  site_id uuid,
  submitted_by uuid not null references auth.users(id),
  category text not null,
  description text not null,
  vendor_name text,
  amount numeric(18,2) not null check (amount > 0),
  currency text not null default 'NGN',
  expense_date date not null,
  status text not null default 'PENDING' check (status in ('PENDING','APPROVED','REJECTED','PAID','CANCELLED')),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  rejection_reason text,
  receipt_path text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.expense_approvals (
  id uuid primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  expense_id uuid not null references public.expenses(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id),
  decision text not null check (decision in ('APPROVED','REJECTED')),
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.financial_records (
  id uuid primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid,
  site_id uuid,
  expense_id uuid,
  record_type text not null check (record_type in ('INCOME','EXPENSE','PAYMENT','REFUND','TRANSFER','ADJUSTMENT')),
  reference text,
  description text not null,
  amount numeric(18,2) not null check (amount > 0),
  currency text not null default 'NGN',
  record_date date not null,
  recorded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists expenses_company_date_idx on public.expenses(company_id, expense_date desc);
create index if not exists expenses_company_status_idx on public.expenses(company_id, status);
create index if not exists expenses_project_idx on public.expenses(company_id, project_id);
create index if not exists expense_approvals_expense_idx on public.expense_approvals(company_id, expense_id, created_at desc);
create index if not exists financial_records_company_date_idx on public.financial_records(company_id, record_date desc);
create index if not exists financial_records_project_idx on public.financial_records(company_id, project_id);

alter table public.expenses enable row level security;
alter table public.expense_approvals enable row level security;
alter table public.financial_records enable row level security;

drop policy if exists expenses_member_all on public.expenses;
create policy expenses_member_all on public.expenses for all using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));
drop policy if exists expense_approvals_member_all on public.expense_approvals;
create policy expense_approvals_member_all on public.expense_approvals for all using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));
drop policy if exists financial_records_member_all on public.financial_records;
create policy financial_records_member_all on public.financial_records for all using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));

-- Composite tenant keys are required because PostgreSQL only permits a foreign
-- key to reference a primary key or a UNIQUE constraint with the same columns.
-- The expenses(company_id,id) key is especially important for the approval and
-- financial-record tenant FKs below.
do $$
begin
  if not exists (select 1 from pg_constraint where conname='projects_company_id_id_unique_v09' and conrelid='public.projects'::regclass) then
    alter table public.projects add constraint projects_company_id_id_unique_v09 unique(company_id,id);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='sites_company_id_id_unique_v09' and conrelid='public.sites'::regclass) then
    alter table public.sites add constraint sites_company_id_id_unique_v09 unique(company_id,id);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='expenses_company_id_id_unique_v09' and conrelid='public.expenses'::regclass) then
    alter table public.expenses add constraint expenses_company_id_id_unique_v09 unique(company_id,id);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='expenses_project_tenant_fk' and conrelid='public.expenses'::regclass) then
    alter table public.expenses add constraint expenses_project_tenant_fk foreign key(company_id,project_id) references public.projects(company_id,id) on delete set null;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='expenses_site_tenant_fk' and conrelid='public.expenses'::regclass) then
    alter table public.expenses add constraint expenses_site_tenant_fk foreign key(company_id,site_id) references public.sites(company_id,id) on delete set null;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='expense_approvals_expense_tenant_fk' and conrelid='public.expense_approvals'::regclass) then
    alter table public.expense_approvals add constraint expense_approvals_expense_tenant_fk foreign key(company_id,expense_id) references public.expenses(company_id,id) on delete cascade;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='financial_records_project_tenant_fk' and conrelid='public.financial_records'::regclass) then
    alter table public.financial_records add constraint financial_records_project_tenant_fk foreign key(company_id,project_id) references public.projects(company_id,id) on delete set null;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='financial_records_site_tenant_fk' and conrelid='public.financial_records'::regclass) then
    alter table public.financial_records add constraint financial_records_site_tenant_fk foreign key(company_id,site_id) references public.sites(company_id,id) on delete set null;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='financial_records_expense_tenant_fk' and conrelid='public.financial_records'::regclass) then
    alter table public.financial_records add constraint financial_records_expense_tenant_fk foreign key(company_id,expense_id) references public.expenses(company_id,id) on delete set null;
  end if;
end $$;

create or replace function public.approve_expense(
  p_company_id uuid,
  p_expense_id uuid,
  p_user_id uuid,
  p_decision text,
  p_reason text default null
) returns public.expenses
language plpgsql security definer set search_path = public
as $$
declare v_expense public.expenses;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then raise exception 'AUTH_IDENTITY_MISMATCH' using errcode='42501'; end if;
  if not public.is_company_member(p_company_id) then raise exception 'COMPANY_ACCESS_DENIED' using errcode='42501'; end if;
  if p_decision not in ('APPROVED','REJECTED') then raise exception 'INVALID_DECISION' using errcode='22023'; end if;
  select * into v_expense from public.expenses where company_id=p_company_id and id=p_expense_id for update;
  if not found then raise exception 'EXPENSE_NOT_FOUND' using errcode='P0002'; end if;
  if v_expense.status <> 'PENDING' then raise exception 'EXPENSE_NOT_PENDING' using errcode='55000'; end if;
  update public.expenses set status=p_decision, approved_by=p_user_id, approved_at=now(), rejection_reason=case when p_decision='REJECTED' then nullif(trim(p_reason),'') else null end, updated_at=now() where company_id=p_company_id and id=p_expense_id returning * into v_expense;
  insert into public.expense_approvals(id,company_id,expense_id,actor_user_id,decision,reason) values (gen_random_uuid(),p_company_id,p_expense_id,p_user_id,p_decision,nullif(trim(p_reason),''));
  return v_expense;
end $$;
revoke all on function public.approve_expense(uuid,uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.approve_expense(uuid,uuid,uuid,text,text) to authenticated;

create or replace function public.mark_expense_paid(
  p_company_id uuid,
  p_expense_id uuid,
  p_user_id uuid,
  p_reference text default null
) returns public.expenses
language plpgsql security definer set search_path = public
as $$
declare v_expense public.expenses;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then raise exception 'AUTH_IDENTITY_MISMATCH' using errcode='42501'; end if;
  if not public.is_company_member(p_company_id) then raise exception 'COMPANY_ACCESS_DENIED' using errcode='42501'; end if;
  select * into v_expense from public.expenses where company_id=p_company_id and id=p_expense_id for update;
  if not found then raise exception 'EXPENSE_NOT_FOUND' using errcode='P0002'; end if;
  if v_expense.status <> 'APPROVED' then raise exception 'EXPENSE_NOT_APPROVED' using errcode='55000'; end if;
  update public.expenses set status='PAID', updated_at=now() where company_id=p_company_id and id=p_expense_id returning * into v_expense;
  insert into public.financial_records(id,company_id,project_id,site_id,expense_id,record_type,reference,description,amount,currency,record_date,recorded_by)
  values(gen_random_uuid(),p_company_id,v_expense.project_id,v_expense.site_id,v_expense.id,'PAYMENT',nullif(trim(p_reference),''),v_expense.description,v_expense.amount,v_expense.currency,current_date,p_user_id);
  return v_expense;
end $$;
revoke all on function public.mark_expense_paid(uuid,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.mark_expense_paid(uuid,uuid,uuid,text) to authenticated;

insert into public.permissions(key,description) values
('expense:create','Create expense records'),
('expense:read','Read expense and financial records'),
('expense:approve','Approve or reject pending expenses'),
('expense:pay','Mark approved expenses as paid'),
('finance:create','Create financial records'),
('finance:read','Read financial records')
on conflict(key) do update set description=excluded.description;

delete from public.role_permissions where permission_key in ('expense:create','expense:read','expense:approve','expense:pay','finance:create','finance:read');
insert into public.role_permissions(role,permission_key) values
('SUPER_ADMIN','expense:create'),('SUPER_ADMIN','expense:read'),('SUPER_ADMIN','expense:approve'),('SUPER_ADMIN','expense:pay'),('SUPER_ADMIN','finance:create'),('SUPER_ADMIN','finance:read'),
('COMPANY_OWNER','expense:create'),('COMPANY_OWNER','expense:read'),('COMPANY_OWNER','expense:approve'),('COMPANY_OWNER','expense:pay'),('COMPANY_OWNER','finance:create'),('COMPANY_OWNER','finance:read'),
('COMPANY_ADMIN','expense:create'),('COMPANY_ADMIN','expense:read'),('COMPANY_ADMIN','expense:approve'),('COMPANY_ADMIN','expense:pay'),('COMPANY_ADMIN','finance:create'),('COMPANY_ADMIN','finance:read'),
('DIRECTOR','expense:create'),('DIRECTOR','expense:read'),('DIRECTOR','expense:approve'),('DIRECTOR','expense:pay'),('DIRECTOR','finance:create'),('DIRECTOR','finance:read'),
('ACCOUNTANT','expense:create'),('ACCOUNTANT','expense:read'),('ACCOUNTANT','expense:approve'),('ACCOUNTANT','expense:pay'),('ACCOUNTANT','finance:create'),('ACCOUNTANT','finance:read'),
('PROJECT_MANAGER','expense:create'),('PROJECT_MANAGER','expense:read'),('PROJECT_MANAGER','finance:read'),
('SITE_ENGINEER','expense:create'),('SITE_ENGINEER','expense:read'),
('SITE_SUPERVISOR','expense:create'),('SITE_SUPERVISOR','expense:read');
