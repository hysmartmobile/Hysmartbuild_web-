begin;
create extension if not exists pgcrypto;
create table if not exists public.executive_intelligence_snapshots (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 project_id uuid, snapshot_date date not null default current_date, health_score numeric(8,2) not null default 100,
 health_status text not null default 'GREEN' check(health_status in ('GREEN','AMBER','RED')), forecast_cost numeric(20,4) not null default 0,
 cost_variance numeric(20,4) not null default 0, schedule_variance_days integer not null default 0, confidence numeric(8,2) not null default 0,
 risk_count integer not null default 0, critical_delay_count integer not null default 0, open_action_count integer not null default 0,
 drivers jsonb not null default '[]'::jsonb, created_by uuid references auth.users(id), created_at timestamptz not null default now(),
 unique(company_id,project_id,snapshot_date)
);
alter table public.executive_intelligence_snapshots add constraint executive_snapshot_project_tenant_fk foreign key(company_id,project_id) references public.projects(company_id,id) on delete cascade;
create index if not exists executive_snapshot_company_date_idx on public.executive_intelligence_snapshots(company_id,snapshot_date desc);
create index if not exists executive_snapshot_project_date_idx on public.executive_intelligence_snapshots(company_id,project_id,snapshot_date desc);
alter table public.executive_intelligence_snapshots enable row level security;
drop policy if exists executive_snapshot_member_all on public.executive_intelligence_snapshots;
create policy executive_snapshot_member_all on public.executive_intelligence_snapshots for all using(public.is_company_member(company_id)) with check(public.is_company_member(company_id));
insert into public.permissions(key,description) values ('executive:read','View executive portfolio intelligence and forecasts'),('executive:manage','Capture executive intelligence snapshots') on conflict(key) do update set description=excluded.description;
delete from public.role_permissions where permission_key in ('executive:read','executive:manage');
insert into public.role_permissions(role,permission_key) values
('SUPER_ADMIN','executive:read'),('SUPER_ADMIN','executive:manage'),('COMPANY_OWNER','executive:read'),('COMPANY_OWNER','executive:manage'),('COMPANY_ADMIN','executive:read'),('COMPANY_ADMIN','executive:manage'),('DIRECTOR','executive:read'),('DIRECTOR','executive:manage'),('PROJECT_MANAGER','executive:read');
notify pgrst,'reload schema';
commit;
