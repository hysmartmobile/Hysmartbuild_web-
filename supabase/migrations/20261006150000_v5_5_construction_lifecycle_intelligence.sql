begin;

create table if not exists public.construction_tender_opportunities (
  id uuid primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  client_name text,
  currency_code text not null default 'NGN',
  tender_value numeric,
  target_margin_pct numeric,
  expected_start date,
  expected_duration_days integer,
  status text not null default 'DRAFT' check (status in ('DRAFT','UNDER_REVIEW','SUBMITTED','WON','LOST','WITHDRAWN')),
  assumptions jsonb not null default '{}'::jsonb,
  risks jsonb not null default '[]'::jsonb,
  intelligence jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists construction_tender_opportunities_company_idx on public.construction_tender_opportunities(company_id,created_at desc);

create table if not exists public.construction_lifecycle_items (
  id uuid primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  item_type text not null check (item_type in ('CLOSEOUT','DEFECT','COMMISSIONING','AS_BUILT','O_AND_M','CERTIFICATE','RETENTION','FINAL_ACCOUNT','WARRANTY')),
  title text not null,
  description text,
  owner_user_id uuid references auth.users(id) on delete set null,
  due_date date,
  status text not null default 'OPEN' check (status in ('OPEN','IN_PROGRESS','BLOCKED','DONE','WAIVED')),
  evidence_ids jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists construction_lifecycle_items_project_idx on public.construction_lifecycle_items(company_id,project_id,status,due_date);

create table if not exists public.construction_warranties (
  id uuid primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  provider text,
  reference_no text,
  start_date date,
  end_date date,
  status text not null default 'ACTIVE' check (status in ('DRAFT','ACTIVE','EXPIRING','EXPIRED','CLAIMED','CLOSED')),
  coverage text,
  evidence_ids jsonb not null default '[]'::jsonb,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists construction_warranties_project_idx on public.construction_warranties(company_id,project_id,end_date,status);

create table if not exists public.construction_project_lessons (
  id uuid primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  category text not null,
  lesson text not null,
  impact_value numeric,
  currency_code text,
  root_cause text,
  recommendation text,
  evidence_ids jsonb not null default '[]'::jsonb,
  reusable boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists construction_project_lessons_company_idx on public.construction_project_lessons(company_id,category,created_at desc);

create table if not exists public.construction_benchmark_snapshots (
  id uuid primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  metric_key text not null,
  metric_label text not null,
  unit text,
  value numeric,
  sample_size integer not null default 0,
  project_ids jsonb not null default '[]'::jsonb,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists construction_benchmark_snapshots_company_idx on public.construction_benchmark_snapshots(company_id,metric_key,created_at desc);

alter table public.construction_tender_opportunities enable row level security;
alter table public.construction_lifecycle_items enable row level security;
alter table public.construction_warranties enable row level security;
alter table public.construction_project_lessons enable row level security;
alter table public.construction_benchmark_snapshots enable row level security;

drop policy if exists construction_tender_opportunities_member_all on public.construction_tender_opportunities;
create policy construction_tender_opportunities_member_all on public.construction_tender_opportunities for all using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));
drop policy if exists construction_lifecycle_items_member_all on public.construction_lifecycle_items;
create policy construction_lifecycle_items_member_all on public.construction_lifecycle_items for all using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));
drop policy if exists construction_warranties_member_all on public.construction_warranties;
create policy construction_warranties_member_all on public.construction_warranties for all using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));
drop policy if exists construction_project_lessons_member_all on public.construction_project_lessons;
create policy construction_project_lessons_member_all on public.construction_project_lessons for all using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));
drop policy if exists construction_benchmark_snapshots_member_all on public.construction_benchmark_snapshots;
create policy construction_benchmark_snapshots_member_all on public.construction_benchmark_snapshots for all using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));

-- Lifecycle intelligence is decision support; it never awards tenders, closes projects, approves claims or releases retention automatically.
delete from public.role_permissions where permission_key in ('lifecycle:read','lifecycle:manage','lifecycle:approve');
insert into public.role_permissions(role,permission_key) values
('SUPER_ADMIN','lifecycle:read'),('SUPER_ADMIN','lifecycle:manage'),('SUPER_ADMIN','lifecycle:approve'),
('COMPANY_OWNER','lifecycle:read'),('COMPANY_OWNER','lifecycle:manage'),('COMPANY_OWNER','lifecycle:approve'),
('COMPANY_ADMIN','lifecycle:read'),('COMPANY_ADMIN','lifecycle:manage'),
('DIRECTOR','lifecycle:read'),('DIRECTOR','lifecycle:manage'),('DIRECTOR','lifecycle:approve'),
('PROJECT_MANAGER','lifecycle:read'),('PROJECT_MANAGER','lifecycle:manage'),
('ACCOUNTANT','lifecycle:read'),('ACCOUNTANT','lifecycle:manage'),
('COMMERCIAL_MANAGER','lifecycle:read'),('COMMERCIAL_MANAGER','lifecycle:manage'),('COMMERCIAL_MANAGER','lifecycle:approve');

commit;
