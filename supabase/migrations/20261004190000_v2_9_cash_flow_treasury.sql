begin;

create table if not exists public.cash_forecast_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  horizon_weeks integer not null check(horizon_weeks in (13,26,52)),
  collection_rate numeric(8,4) not null default 1 check(collection_rate between 0 and 2),
  payment_rate numeric(8,4) not null default 1 check(payment_rate between 0 and 2),
  contingency_rate numeric(8,4) not null default 0 check(contingency_rate between 0 and 1),
  opening_cash numeric(20,4) not null default 0,
  minimum_cash numeric(20,4) not null default 0,
  ending_cash numeric(20,4) not null default 0,
  peak_funding_gap numeric(20,4) not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique(company_id,id)
);
create index if not exists cash_forecast_runs_company_created_idx on public.cash_forecast_runs(company_id,created_at desc);
create index if not exists cash_forecast_runs_project_created_idx on public.cash_forecast_runs(company_id,project_id,created_at desc);

create table if not exists public.cash_forecast_lines (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.cash_forecast_runs(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  week_start date not null,
  opening_cash numeric(20,4) not null default 0,
  expected_collections numeric(20,4) not null default 0,
  expected_supplier_payments numeric(20,4) not null default 0,
  expected_payroll numeric(20,4) not null default 0,
  committed_cash_out numeric(20,4) not null default 0,
  contingency_out numeric(20,4) not null default 0,
  net_cash_movement numeric(20,4) not null default 0,
  closing_cash numeric(20,4) not null default 0,
  funding_gap numeric(20,4) not null default 0,
  created_at timestamptz not null default now(),
  unique(run_id,week_start)
);
create index if not exists cash_forecast_lines_company_week_idx on public.cash_forecast_lines(company_id,week_start);

alter table public.cash_forecast_runs enable row level security;
alter table public.cash_forecast_lines enable row level security;
drop policy if exists cash_forecast_runs_member_all on public.cash_forecast_runs;
create policy cash_forecast_runs_member_all on public.cash_forecast_runs for all using(public.is_company_member(company_id)) with check(public.is_company_member(company_id));
drop policy if exists cash_forecast_lines_member_all on public.cash_forecast_lines;
create policy cash_forecast_lines_member_all on public.cash_forecast_lines for all using(public.is_company_member(company_id)) with check(public.is_company_member(company_id));

alter table public.cash_forecast_runs add constraint cash_forecast_runs_project_tenant_fk foreign key(company_id,project_id) references public.projects(company_id,id) on delete cascade;
alter table public.cash_forecast_lines add constraint cash_forecast_lines_run_tenant_fk foreign key(company_id,run_id) references public.cash_forecast_runs(company_id,id) on delete cascade;
alter table public.cash_forecast_lines add constraint cash_forecast_lines_project_tenant_fk foreign key(company_id,project_id) references public.projects(company_id,id) on delete cascade;

insert into public.permissions(key,description) values
('treasury:read','View cash flow forecasts, liquidity risk and treasury dashboard'),
('treasury:manage','Create cash flow forecasts and treasury scenarios')
on conflict(key) do update set description=excluded.description;
delete from public.role_permissions where permission_key in ('treasury:read','treasury:manage');
insert into public.role_permissions(role,permission_key) values
('SUPER_ADMIN','treasury:read'),('SUPER_ADMIN','treasury:manage'),
('COMPANY_OWNER','treasury:read'),('COMPANY_OWNER','treasury:manage'),
('COMPANY_ADMIN','treasury:read'),('COMPANY_ADMIN','treasury:manage'),
('DIRECTOR','treasury:read'),('DIRECTOR','treasury:manage'),
('ACCOUNTANT','treasury:read'),('ACCOUNTANT','treasury:manage'),
('PROJECT_MANAGER','treasury:read'),('PROJECT_MANAGER','treasury:manage');

notify pgrst, 'reload schema';
commit;
