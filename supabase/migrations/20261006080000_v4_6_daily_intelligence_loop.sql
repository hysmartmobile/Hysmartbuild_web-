-- V4.6 Daily Intelligence Loop
-- Persists the management memory required for: changed -> explained -> prioritized -> acted -> measured.
create table if not exists public.daily_intelligence_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid null references public.projects(id) on delete cascade,
  scope_key text generated always as (coalesce(project_id::text, 'GLOBAL')) stored,
  role text not null,
  snapshot_date date not null,
  generated_at timestamptz not null default now(),
  previous_snapshot_id uuid null references public.daily_intelligence_snapshots(id) on delete set null,
  summary jsonb not null default '{}'::jsonb,
  changed_items jsonb not null default '[]'::jsonb,
  worse_items jsonb not null default '[]'::jsonb,
  better_items jsonb not null default '[]'::jsonb,
  consequences jsonb not null default '[]'::jsonb,
  priorities jsonb not null default '[]'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  source_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_intelligence_role_check check (role <> ''),
  constraint daily_intelligence_snapshot_unique unique(company_id, project_id, role, snapshot_date),
  constraint daily_intelligence_scope_unique unique(company_id, scope_key, role, snapshot_date)
);

create index if not exists daily_intelligence_company_date_idx on public.daily_intelligence_snapshots(company_id, snapshot_date desc);
create index if not exists daily_intelligence_project_date_idx on public.daily_intelligence_snapshots(project_id, snapshot_date desc);

create table if not exists public.daily_intelligence_outcomes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid null references public.projects(id) on delete set null,
  snapshot_id uuid not null references public.daily_intelligence_snapshots(id) on delete cascade,
  action_id uuid null references public.workflow_action_items(id) on delete set null,
  action_key text,
  outcome text not null,
  before_value numeric,
  after_value numeric,
  unit text,
  notes text,
  measured_by uuid,
  measured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists daily_intelligence_outcomes_snapshot_idx on public.daily_intelligence_outcomes(snapshot_id, measured_at desc);
create index if not exists daily_intelligence_outcomes_company_idx on public.daily_intelligence_outcomes(company_id, measured_at desc);

alter table public.daily_intelligence_snapshots enable row level security;
alter table public.daily_intelligence_outcomes enable row level security;

-- Application access is enforced by the existing authenticated API/RBAC layer.
-- Keep tables tenant-safe even if accessed directly through a future policy layer.
