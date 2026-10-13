-- HySmart Build V5.4: Financial Intelligence / Construction Finance Truth
begin;
create table if not exists public.financial_intelligence_snapshots (
  id uuid primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists financial_intelligence_snapshots_company_idx on public.financial_intelligence_snapshots(company_id,created_at desc);
create index if not exists financial_intelligence_snapshots_project_idx on public.financial_intelligence_snapshots(company_id,project_id,created_at desc);
alter table public.financial_intelligence_snapshots enable row level security;
drop policy if exists financial_intelligence_snapshots_member_all on public.financial_intelligence_snapshots;
create policy financial_intelligence_snapshots_member_all on public.financial_intelligence_snapshots for all using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));

-- V5.4 permissions: finance intelligence is read/refresh intelligence, not payment authority.
delete from public.role_permissions where permission_key in ('financial-intelligence:read','financial-intelligence:manage');
insert into public.role_permissions(role,permission_key) values
('SUPER_ADMIN','financial-intelligence:read'),('SUPER_ADMIN','financial-intelligence:manage'),
('COMPANY_OWNER','financial-intelligence:read'),('COMPANY_OWNER','financial-intelligence:manage'),
('COMPANY_ADMIN','financial-intelligence:read'),('COMPANY_ADMIN','financial-intelligence:manage'),
('DIRECTOR','financial-intelligence:read'),('DIRECTOR','financial-intelligence:manage'),
('PROJECT_MANAGER','financial-intelligence:read'),
('ACCOUNTANT','financial-intelligence:read'),('ACCOUNTANT','financial-intelligence:manage');
commit;
