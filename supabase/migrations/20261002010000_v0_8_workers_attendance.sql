-- V0.8: workforce profiles, project/site assignments, and attendance.
create table public.workers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  employee_code text not null,
  full_name text not null,
  phone text,
  trade text,
  job_title text,
  hire_date date,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE','SUSPENDED')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, employee_code)
);

create unique index workers_company_user_unique on public.workers(company_id,user_id) where user_id is not null;

create table public.worker_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  worker_id uuid not null references public.workers(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  site_id uuid references public.sites(id) on delete set null,
  assignment_role text,
  start_date date not null,
  end_date date,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','ENDED','CANCELLED')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check (project_id is not null or site_id is not null),
  check (end_date is null or end_date >= start_date)
);

create index worker_assignments_company_worker_idx on public.worker_assignments(company_id,worker_id,status);
create index worker_assignments_project_site_idx on public.worker_assignments(company_id,project_id,site_id,status);

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  worker_id uuid not null references public.workers(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  site_id uuid not null references public.sites(id) on delete cascade,
  attendance_date date not null,
  status text not null check (status in ('PRESENT','ABSENT','LATE','ON_LEAVE')),
  check_in_at timestamptz,
  check_out_at timestamptz,
  notes text,
  recorded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id,worker_id,site_id,attendance_date),
  check (check_out_at is null or check_in_at is null or check_out_at >= check_in_at)
);

create index workers_company_status_idx on public.workers(company_id,status,full_name);
create index attendance_company_date_idx on public.attendance_records(company_id,attendance_date desc);
create index attendance_company_site_date_idx on public.attendance_records(company_id,site_id,attendance_date desc);
create index attendance_company_worker_date_idx on public.attendance_records(company_id,worker_id,attendance_date desc);

create trigger workers_updated_at before update on public.workers for each row execute procedure public.set_updated_at();
create trigger attendance_updated_at before update on public.attendance_records for each row execute procedure public.set_updated_at();

alter table public.workers enable row level security;
alter table public.worker_assignments enable row level security;
alter table public.attendance_records enable row level security;

create policy workers_member_all on public.workers for all using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));
create policy worker_assignments_member_all on public.worker_assignments for all using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));
create policy attendance_member_all on public.attendance_records for all using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));

insert into public.permissions(key,description) values
('worker:create','Create workforce profiles'),
('worker:read','Read workforce profiles'),
('worker:update','Update workforce profiles'),
('worker:delete','Deactivate workforce profiles'),
('worker:assign','Assign workers to projects and sites'),
('attendance:create','Record attendance'),
('attendance:read','Read attendance records and summaries'),
('attendance:update','Correct attendance records')
on conflict(key) do update set description=excluded.description;

delete from public.role_permissions where permission_key in ('worker:create','worker:read','worker:update','worker:delete','worker:assign','attendance:create','attendance:read','attendance:update');
insert into public.role_permissions(role,permission_key) values
('SUPER_ADMIN','worker:create'),('SUPER_ADMIN','worker:read'),('SUPER_ADMIN','worker:update'),('SUPER_ADMIN','worker:delete'),('SUPER_ADMIN','worker:assign'),('SUPER_ADMIN','attendance:create'),('SUPER_ADMIN','attendance:read'),('SUPER_ADMIN','attendance:update'),
('COMPANY_OWNER','worker:create'),('COMPANY_OWNER','worker:read'),('COMPANY_OWNER','worker:update'),('COMPANY_OWNER','worker:delete'),('COMPANY_OWNER','worker:assign'),('COMPANY_OWNER','attendance:create'),('COMPANY_OWNER','attendance:read'),('COMPANY_OWNER','attendance:update'),
('COMPANY_ADMIN','worker:create'),('COMPANY_ADMIN','worker:read'),('COMPANY_ADMIN','worker:update'),('COMPANY_ADMIN','worker:delete'),('COMPANY_ADMIN','worker:assign'),('COMPANY_ADMIN','attendance:create'),('COMPANY_ADMIN','attendance:read'),('COMPANY_ADMIN','attendance:update'),
('DIRECTOR','worker:create'),('DIRECTOR','worker:read'),('DIRECTOR','worker:update'),('DIRECTOR','worker:delete'),('DIRECTOR','worker:assign'),('DIRECTOR','attendance:create'),('DIRECTOR','attendance:read'),('DIRECTOR','attendance:update'),
('HR_MANAGER','worker:create'),('HR_MANAGER','worker:read'),('HR_MANAGER','worker:update'),('HR_MANAGER','worker:delete'),('HR_MANAGER','worker:assign'),('HR_MANAGER','attendance:create'),('HR_MANAGER','attendance:read'),('HR_MANAGER','attendance:update'),
('PROJECT_MANAGER','worker:read'),('PROJECT_MANAGER','worker:assign'),('PROJECT_MANAGER','attendance:create'),('PROJECT_MANAGER','attendance:read'),('PROJECT_MANAGER','attendance:update'),
('SITE_ENGINEER','worker:read'),('SITE_ENGINEER','worker:assign'),('SITE_ENGINEER','attendance:create'),('SITE_ENGINEER','attendance:read'),('SITE_ENGINEER','attendance:update'),
('SITE_SUPERVISOR','worker:read'),('SITE_SUPERVISOR','attendance:create'),('SITE_SUPERVISOR','attendance:read'),('SITE_SUPERVISOR','attendance:update'),
('WORKER','worker:read'),('WORKER','attendance:read');

-- Composite tenant foreign keys prevent cross-company references even when data is written outside the API.
alter table public.projects add constraint projects_company_id_id_unique_v08 unique(company_id,id);
alter table public.sites add constraint sites_company_id_id_unique_v08 unique(company_id,id);
alter table public.workers add constraint workers_company_id_id_unique unique(company_id,id);
alter table public.worker_assignments add constraint worker_assignments_worker_tenant_fk foreign key(company_id,worker_id) references public.workers(company_id,id) on delete cascade;
alter table public.worker_assignments add constraint worker_assignments_project_tenant_fk foreign key(company_id,project_id) references public.projects(company_id,id) on delete cascade;
alter table public.worker_assignments add constraint worker_assignments_site_tenant_fk foreign key(company_id,site_id) references public.sites(company_id,id) on delete cascade;
alter table public.attendance_records add constraint attendance_worker_tenant_fk foreign key(company_id,worker_id) references public.workers(company_id,id) on delete cascade;
alter table public.attendance_records add constraint attendance_project_tenant_fk foreign key(company_id,project_id) references public.projects(company_id,id) on delete cascade;
alter table public.attendance_records add constraint attendance_site_tenant_fk foreign key(company_id,site_id) references public.sites(company_id,id) on delete cascade;
