-- V4.3 People, Teams & Accountability. Additive only; existing identity/workforce/project data remains authoritative.
begin;
create table if not exists public.company_people_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  worker_id uuid references public.workers(id) on delete cascade,
  department text,
  job_title text,
  employee_code text,
  supervisor_user_id uuid references auth.users(id) on delete set null,
  employment_status text not null default 'ACTIVE' check (employment_status in ('ACTIVE','INACTIVE','SUSPENDED','ON_LEAVE')),
  joined_date date,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (user_id is not null or worker_id is not null)
);
create unique index if not exists company_people_profiles_company_user_uidx on public.company_people_profiles(company_id,user_id) where user_id is not null;
create unique index if not exists company_people_profiles_company_worker_uidx on public.company_people_profiles(company_id,worker_id) where worker_id is not null;
create index if not exists company_people_profiles_company_idx on public.company_people_profiles(company_id,employment_status);
create index if not exists company_people_profiles_supervisor_idx on public.company_people_profiles(company_id,supervisor_user_id);
create trigger company_people_profiles_updated_at before update on public.company_people_profiles for each row execute procedure public.set_updated_at();
alter table public.company_people_profiles enable row level security;
create policy company_people_profiles_member_all on public.company_people_profiles for all using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));

insert into public.permissions(key,description) values
 ('people:read','Read company people profiles and team directory'),
 ('people:manage','Manage people operational profile metadata and team accountability'),
 ('people:contact','View permitted operational contact details and contact actions'),
 ('people:attendance','View people attendance and site presence context')
on conflict(key) do update set description=excluded.description;

delete from public.role_permissions where permission_key in ('people:read','people:manage','people:contact','people:attendance');
insert into public.role_permissions(role,permission_key) values
 ('SUPER_ADMIN','people:read'),('SUPER_ADMIN','people:manage'),('SUPER_ADMIN','people:contact'),('SUPER_ADMIN','people:attendance'),
 ('COMPANY_OWNER','people:read'),('COMPANY_OWNER','people:manage'),('COMPANY_OWNER','people:contact'),('COMPANY_OWNER','people:attendance'),
 ('COMPANY_ADMIN','people:read'),('COMPANY_ADMIN','people:manage'),('COMPANY_ADMIN','people:contact'),('COMPANY_ADMIN','people:attendance'),
 ('DIRECTOR','people:read'),('DIRECTOR','people:manage'),('DIRECTOR','people:contact'),('DIRECTOR','people:attendance'),
 ('HR_MANAGER','people:read'),('HR_MANAGER','people:manage'),('HR_MANAGER','people:contact'),('HR_MANAGER','people:attendance'),
 ('PROJECT_MANAGER','people:read'),('PROJECT_MANAGER','people:contact'),('PROJECT_MANAGER','people:attendance'),
 ('SITE_ENGINEER','people:read'),('SITE_ENGINEER','people:contact'),('SITE_ENGINEER','people:attendance'),
 ('SITE_SUPERVISOR','people:read'),('SITE_SUPERVISOR','people:contact'),('SITE_SUPERVISOR','people:attendance'),
 ('ACCOUNTANT','people:read'),('ACCOUNTANT','people:contact'),
 ('STOREKEEPER','people:read'),('STOREKEEPER','people:contact'),
 ('WORKER','people:read');
commit;
notify pgrst, 'reload schema';
