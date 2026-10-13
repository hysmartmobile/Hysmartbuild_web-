begin;

create table if not exists public.project_cost_codes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  name text not null,
  category text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, code)
);
create index if not exists project_cost_codes_company_idx on public.project_cost_codes(company_id, active);
alter table public.project_cost_codes enable row level security;
drop policy if exists project_cost_codes_member_all on public.project_cost_codes;
create policy project_cost_codes_member_all on public.project_cost_codes for all using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));

create table if not exists public.project_wbs_nodes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  parent_id uuid references public.project_wbs_nodes(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  sort_order integer not null default 0,
  planned_start date,
  planned_finish date,
  actual_start date,
  actual_finish date,
  status text not null default 'NOT_STARTED' check(status in ('NOT_STARTED','IN_PROGRESS','COMPLETED','ON_HOLD')),
  percent_complete numeric(8,4) not null default 0 check(percent_complete between 0 and 100),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, project_id, code)
);
create index if not exists project_wbs_nodes_project_idx on public.project_wbs_nodes(company_id, project_id, parent_id);
alter table public.project_wbs_nodes enable row level security;
drop policy if exists project_wbs_nodes_member_all on public.project_wbs_nodes;
create policy project_wbs_nodes_member_all on public.project_wbs_nodes for all using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));

alter table public.project_change_orders add column if not exists approved_by uuid references auth.users(id);
alter table public.project_change_orders add column if not exists approval_notes text;
alter table public.project_change_orders add column if not exists client_approved boolean not null default false;
alter table public.project_change_orders add column if not exists client_approved_date date;
alter table public.project_change_orders add column if not exists cost_impact numeric(18,2) not null default 0;
alter table public.project_change_orders add column if not exists time_impact_days integer not null default 0;

create index if not exists project_change_orders_approval_idx on public.project_change_orders(company_id, project_id, status, approved_date);

-- Approved commercial values are now easy to aggregate consistently.
create or replace view public.project_commercial_summary_v with (security_invoker = true) as
select
  p.company_id,
  p.id as project_id,
  p.name as project_name,
  p.currency,
  coalesce((select max(e.total_amount) from public.project_estimates e where e.company_id=p.company_id and e.project_id=p.id and e.status='APPROVED'),0) as approved_estimate,
  coalesce((select max(b.total_budget) from public.project_budget_baselines b where b.company_id=p.company_id and b.project_id=p.id and b.status='APPROVED'),0) as approved_budget,
  coalesce((select sum(co.amount) from public.project_change_orders co where co.company_id=p.company_id and co.project_id=p.id and co.status='APPROVED'),0) as approved_variations,
  coalesce((select sum(i.net_amount) from public.project_client_ipcs i where i.company_id=p.company_id and i.project_id=p.id and i.status in ('APPROVED','INVOICED','PAID')),0) as certified_value,
  coalesce((select sum(i.net_amount) from public.project_client_ipcs i where i.company_id=p.company_id and i.project_id=p.id and i.status in ('INVOICED','PAID')),0) as invoiced_certified_value,
  coalesce((select sum(i.amount) from public.project_cost_ledger_v i where i.company_id=p.company_id and i.project_id=p.id and i.entry_type='COMMITMENT'),0) as committed_cost,
  coalesce((select sum(i.amount) from public.project_cost_ledger_v i where i.company_id=p.company_id and i.project_id=p.id and i.entry_type='ACTUAL'),0) as actual_cost
from public.projects p;

notify pgrst, 'reload schema';
commit;
