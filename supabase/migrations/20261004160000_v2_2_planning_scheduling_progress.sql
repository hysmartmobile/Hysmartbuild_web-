begin;

create table if not exists public.project_schedule_activities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  wbs_node_id uuid references public.project_wbs_nodes(id) on delete set null,
  parent_activity_id uuid references public.project_schedule_activities(id) on delete set null,
  activity_code text not null,
  name text not null,
  description text,
  activity_type text not null default 'TASK' check(activity_type in ('TASK','MILESTONE','SUMMARY')),
  calendar_days integer not null default 1 check(calendar_days >= 0),
  planned_start date not null,
  planned_finish date not null,
  actual_start date,
  actual_finish date,
  status text not null default 'NOT_STARTED' check(status in ('NOT_STARTED','IN_PROGRESS','COMPLETED','ON_HOLD','CANCELLED')),
  percent_complete numeric(8,4) not null default 0 check(percent_complete between 0 and 100),
  progress_weight numeric(12,4) not null default 1 check(progress_weight >= 0),
  cost_code text,
  responsible_user_id uuid references auth.users(id),
  is_critical boolean not null default false,
  total_float_days integer,
  schedule_variance_days integer not null default 0,
  forecast_finish date,
  delay_days integer not null default 0,
  delay_reason text,
  sort_order integer not null default 0,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, project_id, activity_code),
  check(planned_finish >= planned_start),
  check(actual_finish is null or actual_start is null or actual_finish >= actual_start)
);
alter table public.project_schedule_activities add constraint project_schedule_activities_company_project_id_uq unique(company_id,project_id,id);
alter table public.project_schedule_activities add constraint project_schedule_activities_parent_tenant_fk foreign key(company_id,project_id,parent_activity_id) references public.project_schedule_activities(company_id,project_id,id) on delete set null;

create index if not exists project_schedule_activities_project_idx on public.project_schedule_activities(company_id,project_id,planned_start,planned_finish);
create index if not exists project_schedule_activities_critical_idx on public.project_schedule_activities(company_id,project_id,is_critical,total_float_days);
alter table public.project_schedule_activities enable row level security;
drop policy if exists project_schedule_activities_member_all on public.project_schedule_activities;
create policy project_schedule_activities_member_all on public.project_schedule_activities for all using(public.is_company_member(company_id)) with check(public.is_company_member(company_id));

create table if not exists public.project_schedule_dependencies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  predecessor_id uuid not null references public.project_schedule_activities(id) on delete cascade,
  successor_id uuid not null references public.project_schedule_activities(id) on delete cascade,
  dependency_type text not null default 'FS' check(dependency_type in ('FS','SS','FF','SF')),
  lag_days integer not null default 0,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(company_id, predecessor_id, successor_id),
  check(predecessor_id <> successor_id)
);
alter table public.project_schedule_dependencies add constraint project_schedule_dependencies_predecessor_tenant_fk foreign key(company_id,project_id,predecessor_id) references public.project_schedule_activities(company_id,project_id,id) on delete cascade;
alter table public.project_schedule_dependencies add constraint project_schedule_dependencies_successor_tenant_fk foreign key(company_id,project_id,successor_id) references public.project_schedule_activities(company_id,project_id,id) on delete cascade;

create index if not exists project_schedule_dependencies_project_idx on public.project_schedule_dependencies(company_id,project_id);
alter table public.project_schedule_dependencies enable row level security;
drop policy if exists project_schedule_dependencies_member_all on public.project_schedule_dependencies;
create policy project_schedule_dependencies_member_all on public.project_schedule_dependencies for all using(public.is_company_member(company_id)) with check(public.is_company_member(company_id));

create table if not exists public.project_schedule_baselines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  baseline_no integer not null,
  name text not null,
  status text not null default 'DRAFT' check(status in ('DRAFT','APPROVED','SUPERSEDED')),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(company_id,project_id,baseline_no)
);
create index if not exists project_schedule_baselines_project_idx on public.project_schedule_baselines(company_id,project_id,status);
alter table public.project_schedule_baselines enable row level security;
drop policy if exists project_schedule_baselines_member_all on public.project_schedule_baselines;
create policy project_schedule_baselines_member_all on public.project_schedule_baselines for all using(public.is_company_member(company_id)) with check(public.is_company_member(company_id));

create table if not exists public.project_schedule_baseline_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  baseline_id uuid not null references public.project_schedule_baselines(id) on delete cascade,
  activity_id uuid not null references public.project_schedule_activities(id) on delete cascade,
  planned_start date not null,
  planned_finish date not null,
  calendar_days integer not null default 1,
  created_at timestamptz not null default now(),
  unique(baseline_id,activity_id),
  check(planned_finish >= planned_start)
);
alter table public.project_schedule_baselines add constraint project_schedule_baselines_company_project_id_uq unique(company_id,project_id,id);
alter table public.project_schedule_baseline_items add constraint project_schedule_baseline_items_baseline_tenant_fk foreign key(company_id,project_id,baseline_id) references public.project_schedule_baselines(company_id,project_id,id) on delete cascade;
alter table public.project_schedule_baseline_items add constraint project_schedule_baseline_items_activity_tenant_fk foreign key(company_id,project_id,activity_id) references public.project_schedule_activities(company_id,project_id,id) on delete cascade;

create index if not exists project_schedule_baseline_items_project_idx on public.project_schedule_baseline_items(company_id,project_id,baseline_id);
alter table public.project_schedule_baseline_items enable row level security;
drop policy if exists project_schedule_baseline_items_member_all on public.project_schedule_baseline_items;
create policy project_schedule_baseline_items_member_all on public.project_schedule_baseline_items for all using(public.is_company_member(company_id)) with check(public.is_company_member(company_id));

create table if not exists public.project_schedule_progress_updates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  activity_id uuid not null references public.project_schedule_activities(id) on delete cascade,
  progress_date date not null default current_date,
  percent_complete numeric(8,4) not null check(percent_complete between 0 and 100),
  actual_start date,
  actual_finish date,
  notes text,
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.project_schedule_progress_updates add constraint project_schedule_progress_activity_tenant_fk foreign key(company_id,project_id,activity_id) references public.project_schedule_activities(company_id,project_id,id) on delete cascade;

create index if not exists project_schedule_progress_project_date_idx on public.project_schedule_progress_updates(company_id,project_id,progress_date desc);
alter table public.project_schedule_progress_updates enable row level security;
drop policy if exists project_schedule_progress_updates_member_all on public.project_schedule_progress_updates;
create policy project_schedule_progress_updates_member_all on public.project_schedule_progress_updates for all using(public.is_company_member(company_id)) with check(public.is_company_member(company_id));

create table if not exists public.project_schedule_delays (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  activity_id uuid references public.project_schedule_activities(id) on delete set null,
  delay_date date not null default current_date,
  delay_days integer not null check(delay_days > 0),
  reason_category text not null check(reason_category in ('CLIENT','DESIGN','APPROVAL','MATERIAL','LABOUR','EQUIPMENT','WEATHER','SITE','SUBCONTRACTOR','FINANCE','REGULATORY','OTHER')),
  description text not null,
  responsible_party text,
  eot_relevant boolean not null default false,
  eot_status text not null default 'NOT_CLAIMED' check(eot_status in ('NOT_CLAIMED','POTENTIAL','SUBMITTED','APPROVED','REJECTED')),
  evidence_document_id uuid,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.project_schedule_delays add constraint project_schedule_delays_activity_tenant_fk foreign key(company_id,project_id,activity_id) references public.project_schedule_activities(company_id,project_id,id) on delete set null;

create index if not exists project_schedule_delays_project_idx on public.project_schedule_delays(company_id,project_id,delay_date desc);
alter table public.project_schedule_delays enable row level security;
drop policy if exists project_schedule_delays_member_all on public.project_schedule_delays;
create policy project_schedule_delays_member_all on public.project_schedule_delays for all using(public.is_company_member(company_id)) with check(public.is_company_member(company_id));

create or replace function public.touch_v2_2_schedule_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end; $$;
drop trigger if exists touch_project_schedule_activities on public.project_schedule_activities;
create trigger touch_project_schedule_activities before update on public.project_schedule_activities for each row execute function public.touch_v2_2_schedule_updated_at();
drop trigger if exists touch_project_schedule_delays on public.project_schedule_delays;
create trigger touch_project_schedule_delays before update on public.project_schedule_delays for each row execute function public.touch_v2_2_schedule_updated_at();

insert into public.permissions(key,description) values
('schedule:read','View project programmes, schedules and progress controls'),
('schedule:manage','Create and manage programme activities and dependencies'),
('schedule:approve','Approve project schedule baselines and EOT controls')
on conflict(key) do update set description=excluded.description;
delete from public.role_permissions where permission_key in ('schedule:read','schedule:manage','schedule:approve');
insert into public.role_permissions(role,permission_key) values
('SUPER_ADMIN','schedule:read'),('SUPER_ADMIN','schedule:manage'),('SUPER_ADMIN','schedule:approve'),
('COMPANY_OWNER','schedule:read'),('COMPANY_OWNER','schedule:manage'),('COMPANY_OWNER','schedule:approve'),
('COMPANY_ADMIN','schedule:read'),('COMPANY_ADMIN','schedule:manage'),('COMPANY_ADMIN','schedule:approve'),
('DIRECTOR','schedule:read'),('DIRECTOR','schedule:manage'),('DIRECTOR','schedule:approve'),
('PROJECT_MANAGER','schedule:read'),('PROJECT_MANAGER','schedule:manage'),('PROJECT_MANAGER','schedule:approve'),
('SITE_ENGINEER','schedule:read'),('SITE_ENGINEER','schedule:manage'),
('SITE_SUPERVISOR','schedule:read'),('SITE_SUPERVISOR','schedule:manage')
on conflict do nothing;

notify pgrst,'reload schema';
commit;
