begin;

create table if not exists public.project_workfronts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  activity_id uuid references public.project_schedule_activities(id) on delete set null,
  name text not null,
  location text,
  trade text,
  target_quantity numeric(20,4) not null default 0 check(target_quantity >= 0),
  target_productivity numeric(20,6) not null default 0 check(target_productivity >= 0),
  unit text,
  status text not null default 'ACTIVE' check(status in ('ACTIVE','ON_HOLD','COMPLETED','CANCELLED')),
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id,id)
);

alter table public.project_workfronts add constraint workfront_project_tenant_fk foreign key(company_id,project_id) references public.projects(company_id,id) on delete cascade;
alter table public.project_workfronts add constraint workfront_activity_tenant_fk foreign key(company_id,project_id,activity_id) references public.project_schedule_activities(company_id,project_id,id) on delete set null;
create index if not exists project_workfronts_project_status_idx on public.project_workfronts(company_id,project_id,status);

create table if not exists public.project_workfront_readiness_checks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  workfront_id uuid not null references public.project_workfronts(id) on delete cascade,
  check_type text not null check(check_type in ('DRAWING_APPROVED','MATERIAL_AVAILABLE','LABOUR_AVAILABLE','PREDECESSOR_COMPLETE','RFI_RESOLVED','PERMIT_AVAILABLE','INSPECTION_READY','ACCESS_READY','EQUIPMENT_AVAILABLE')),
  status text not null default 'PENDING' check(status in ('READY','BLOCKED','PENDING','NOT_APPLICABLE')),
  note text,
  checked_at timestamptz not null default now(),
  checked_by uuid not null references auth.users(id),
  unique(company_id,workfront_id,check_type)
);
alter table public.project_workfront_readiness_checks add constraint workfront_readiness_project_tenant_fk foreign key(company_id,project_id) references public.projects(company_id,id) on delete cascade;
alter table public.project_workfront_readiness_checks add constraint workfront_readiness_workfront_tenant_fk foreign key(company_id,project_id,workfront_id) references public.project_workfronts(company_id,project_id,id) on delete cascade;
create index if not exists project_workfront_readiness_project_idx on public.project_workfront_readiness_checks(company_id,project_id,workfront_id,status);

create table if not exists public.project_production_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  workfront_id uuid not null references public.project_workfronts(id) on delete cascade,
  activity_id uuid references public.project_schedule_activities(id) on delete set null,
  work_date date not null default current_date,
  shift text,
  quantity_completed numeric(20,4) not null check(quantity_completed >= 0),
  unit text,
  labour_hours numeric(14,2) not null default 0 check(labour_hours >= 0),
  worker_count numeric(12,2) not null default 0 check(worker_count >= 0),
  target_productivity numeric(20,6) not null default 0 check(target_productivity >= 0),
  blocker_type text check(blocker_type is null or blocker_type in ('MATERIAL','LABOUR','EQUIPMENT','DRAWING_RFI','ACCESS_WORKFRONT','REWORK','WEATHER_LOGISTICS','CLIENT_DECISION','OTHER')),
  blocker_note text,
  evidence_note text,
  evidence_urls jsonb not null default '[]'::jsonb,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.project_production_entries add constraint production_project_tenant_fk foreign key(company_id,project_id) references public.projects(company_id,id) on delete cascade;
alter table public.project_production_entries add constraint production_workfront_tenant_fk foreign key(company_id,project_id,workfront_id) references public.project_workfronts(company_id,project_id,id) on delete cascade;
alter table public.project_production_entries add constraint production_activity_tenant_fk foreign key(company_id,project_id,activity_id) references public.project_schedule_activities(company_id,project_id,id) on delete set null;
create index if not exists project_production_project_date_idx on public.project_production_entries(company_id,project_id,work_date desc);
create index if not exists project_production_workfront_date_idx on public.project_production_entries(company_id,project_id,workfront_id,work_date desc);

alter table public.project_workfronts enable row level security;
alter table public.project_workfront_readiness_checks enable row level security;
alter table public.project_production_entries enable row level security;
drop policy if exists project_workfronts_member_all on public.project_workfronts;
create policy project_workfronts_member_all on public.project_workfronts for all using(public.is_company_member(company_id)) with check(public.is_company_member(company_id));
drop policy if exists project_workfront_readiness_member_all on public.project_workfront_readiness_checks;
create policy project_workfront_readiness_member_all on public.project_workfront_readiness_checks for all using(public.is_company_member(company_id)) with check(public.is_company_member(company_id));
drop policy if exists project_production_entries_member_all on public.project_production_entries;
create policy project_production_entries_member_all on public.project_production_entries for all using(public.is_company_member(company_id)) with check(public.is_company_member(company_id));

create or replace function public.touch_v3_6_workfront_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end; $$;
drop trigger if exists touch_project_workfronts on public.project_workfronts;
create trigger touch_project_workfronts before update on public.project_workfronts for each row execute function public.touch_v3_6_workfront_updated_at();

insert into public.permissions(key,description) values
('production:read','View workfront readiness and production intelligence'),
('production:manage','Manage workfront readiness and production records')
on conflict(key) do update set description=excluded.description;
delete from public.role_permissions where permission_key in ('production:read','production:manage');
insert into public.role_permissions(role,permission_key) values
('SUPER_ADMIN','production:read'),('SUPER_ADMIN','production:manage'),
('COMPANY_OWNER','production:read'),('COMPANY_OWNER','production:manage'),
('COMPANY_ADMIN','production:read'),('COMPANY_ADMIN','production:manage'),
('DIRECTOR','production:read'),('DIRECTOR','production:manage'),
('PROJECT_MANAGER','production:read'),('PROJECT_MANAGER','production:manage'),
('SITE_ENGINEER','production:read'),('SITE_ENGINEER','production:manage'),
('SITE_SUPERVISOR','production:read'),('SITE_SUPERVISOR','production:manage'),
('STOREKEEPER','production:read');

notify pgrst, 'reload schema';
commit;
