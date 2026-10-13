begin;
insert into public.permissions(key,description) values
('procurement-intelligence:read','View predictive procurement and material risk intelligence'),
('contract-intelligence:read','View contract entitlement and claims intelligence'),
('construction-truth:read','View unified project construction truth'),
('ai-intelligence:read','View explainable AI-assisted construction recommendations')
on conflict(key) do update set description=excluded.description;
delete from public.role_permissions where permission_key in ('procurement-intelligence:read','contract-intelligence:read','construction-truth:read','ai-intelligence:read');
insert into public.role_permissions(role,permission_key) values
('SUPER_ADMIN','procurement-intelligence:read'),('SUPER_ADMIN','contract-intelligence:read'),('SUPER_ADMIN','construction-truth:read'),('SUPER_ADMIN','ai-intelligence:read'),
('COMPANY_OWNER','procurement-intelligence:read'),('COMPANY_OWNER','contract-intelligence:read'),('COMPANY_OWNER','construction-truth:read'),('COMPANY_OWNER','ai-intelligence:read'),
('COMPANY_ADMIN','procurement-intelligence:read'),('COMPANY_ADMIN','contract-intelligence:read'),('COMPANY_ADMIN','construction-truth:read'),('COMPANY_ADMIN','ai-intelligence:read'),
('DIRECTOR','procurement-intelligence:read'),('DIRECTOR','contract-intelligence:read'),('DIRECTOR','construction-truth:read'),('DIRECTOR','ai-intelligence:read'),
('PROJECT_MANAGER','procurement-intelligence:read'),('PROJECT_MANAGER','contract-intelligence:read'),('PROJECT_MANAGER','construction-truth:read'),('PROJECT_MANAGER','ai-intelligence:read'),
('ACCOUNTANT','procurement-intelligence:read'),('ACCOUNTANT','construction-truth:read'),('ACCOUNTANT','ai-intelligence:read'),
('STOREKEEPER','procurement-intelligence:read'),('STOREKEEPER','construction-truth:read'),
('SITE_ENGINEER','procurement-intelligence:read'),('SITE_ENGINEER','construction-truth:read'),
('SITE_SUPERVISOR','procurement-intelligence:read'),('SITE_SUPERVISOR','construction-truth:read');

create table if not exists public.construction_intelligence_events(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 project_id uuid references public.projects(id) on delete cascade, event_type text not null,
 severity text not null default 'INFO' check(severity in ('INFO','LOW','MEDIUM','HIGH','CRITICAL')),
 title text not null, explanation text, recommendation text, target_value numeric(20,4), currency text,
 source_modules jsonb not null default '[]'::jsonb, evidence jsonb not null default '[]'::jsonb,
 confidence numeric(5,2) check(confidence between 0 and 100), status text not null default 'OPEN' check(status in ('OPEN','ACKNOWLEDGED','ACTIONED','DISMISSED')),
 owner_user_id uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists construction_intelligence_events_project_idx on public.construction_intelligence_events(company_id,project_id,status,created_at desc);
alter table public.construction_intelligence_events enable row level security;
drop policy if exists construction_intelligence_events_member_all on public.construction_intelligence_events;
create policy construction_intelligence_events_member_all on public.construction_intelligence_events for all using(public.is_company_member(company_id)) with check(public.is_company_member(company_id));

create table if not exists public.company_benchmark_snapshots(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 metric text not null, value numeric(20,6) not null, sample_count integer not null default 0, captured_at timestamptz not null default now(), metadata jsonb not null default '{}'::jsonb
);
create index if not exists company_benchmark_snapshots_idx on public.company_benchmark_snapshots(company_id,metric,captured_at desc);
alter table public.company_benchmark_snapshots enable row level security;
drop policy if exists company_benchmark_snapshots_member_all on public.company_benchmark_snapshots;
create policy company_benchmark_snapshots_member_all on public.company_benchmark_snapshots for all using(public.is_company_member(company_id)) with check(public.is_company_member(company_id));

notify pgrst,'reload schema';
commit;
