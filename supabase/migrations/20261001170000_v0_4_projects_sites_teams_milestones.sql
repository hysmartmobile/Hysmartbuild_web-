-- V0.4 construction management core: projects, sites, project teams and milestones.
create extension if not exists pgcrypto;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  code text,
  description text,
  client_name text,
  status text not null default 'PLANNING' check (status in ('PLANNING','ACTIVE','ON_HOLD','COMPLETED','CANCELLED')),
  start_date date,
  expected_end_date date,
  actual_end_date date,
  budget numeric(18,2) not null default 0 check (budget >= 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  address text,
  city text,
  state text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE','CLOSED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'MEMBER' check (role in ('PROJECT_MANAGER','SITE_ENGINEER','SITE_SUPERVISOR','MEMBER','CLIENT')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id,user_id)
);

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  description text,
  due_date date,
  status text not null default 'PENDING' check (status in ('PENDING','IN_PROGRESS','COMPLETED','OVERDUE')),
  progress integer not null default 0 check (progress between 0 and 100),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_company_idx on public.projects(company_id);
create index projects_company_status_idx on public.projects(company_id,status);
create index sites_company_project_idx on public.sites(company_id,project_id);
create index project_members_company_project_idx on public.project_members(company_id,project_id);
create index project_members_user_idx on public.project_members(user_id);
create index milestones_company_project_idx on public.milestones(company_id,project_id);
create index milestones_due_idx on public.milestones(project_id,due_date);

create trigger projects_updated_at before update on public.projects for each row execute procedure public.set_updated_at();
create trigger sites_updated_at before update on public.sites for each row execute procedure public.set_updated_at();
create trigger project_members_updated_at before update on public.project_members for each row execute procedure public.set_updated_at();
create trigger milestones_updated_at before update on public.milestones for each row execute procedure public.set_updated_at();

alter table public.projects enable row level security;
alter table public.sites enable row level security;
alter table public.project_members enable row level security;
alter table public.milestones enable row level security;

create policy projects_member_select on public.projects for select using (public.is_company_member(company_id));
create policy projects_member_insert on public.projects for insert with check (public.is_company_member(company_id) and created_by = auth.uid());
create policy projects_member_update on public.projects for update using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));
create policy projects_member_delete on public.projects for delete using (public.is_company_member(company_id));

create policy sites_member_select on public.sites for select using (public.is_company_member(company_id));
create policy sites_member_insert on public.sites for insert with check (public.is_company_member(company_id));
create policy sites_member_update on public.sites for update using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));
create policy sites_member_delete on public.sites for delete using (public.is_company_member(company_id));

create policy project_members_member_select on public.project_members for select using (public.is_company_member(company_id));
create policy project_members_member_insert on public.project_members for insert with check (public.is_company_member(company_id));
create policy project_members_member_update on public.project_members for update using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));
create policy project_members_member_delete on public.project_members for delete using (public.is_company_member(company_id));

create policy milestones_member_select on public.milestones for select using (public.is_company_member(company_id));
create policy milestones_member_insert on public.milestones for insert with check (public.is_company_member(company_id) and created_by = auth.uid());
create policy milestones_member_update on public.milestones for update using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));
create policy milestones_member_delete on public.milestones for delete using (public.is_company_member(company_id));

insert into public.permissions(key,description) values
 ('project:create','Create projects'),('project:read','Read projects'),('project:update','Update projects'),('project:delete','Delete projects'),
 ('site:create','Create project sites'),('site:read','Read project sites'),('site:update','Update project sites'),('site:delete','Delete project sites'),
 ('project_team:create','Add project team members'),('project_team:read','Read project team members'),('project_team:update','Update project team members'),('project_team:delete','Remove project team members'),
 ('milestone:create','Create project milestones'),('milestone:read','Read project milestones'),('milestone:update','Update project milestones'),('milestone:delete','Delete project milestones')
on conflict (key) do nothing;

-- Replace the broad V0.3 mappings for the construction-core permissions with least privilege.
delete from public.role_permissions where permission_key in (
 'project:create','project:read','project:update','project:delete',
 'site:create','site:read','site:update','site:delete',
 'project_team:create','project_team:read','project_team:update','project_team:delete',
 'milestone:create','milestone:read','milestone:update','milestone:delete'
);

insert into public.role_permissions(role,permission_key) values
 ('SUPER_ADMIN','project:create'),('SUPER_ADMIN','project:read'),('SUPER_ADMIN','project:update'),('SUPER_ADMIN','project:delete'),('SUPER_ADMIN','site:create'),('SUPER_ADMIN','site:read'),('SUPER_ADMIN','site:update'),('SUPER_ADMIN','site:delete'),('SUPER_ADMIN','project_team:create'),('SUPER_ADMIN','project_team:read'),('SUPER_ADMIN','project_team:update'),('SUPER_ADMIN','project_team:delete'),('SUPER_ADMIN','milestone:create'),('SUPER_ADMIN','milestone:read'),('SUPER_ADMIN','milestone:update'),('SUPER_ADMIN','milestone:delete'),
 ('COMPANY_OWNER','project:create'),('COMPANY_OWNER','project:read'),('COMPANY_OWNER','project:update'),('COMPANY_OWNER','project:delete'),('COMPANY_OWNER','site:create'),('COMPANY_OWNER','site:read'),('COMPANY_OWNER','site:update'),('COMPANY_OWNER','site:delete'),('COMPANY_OWNER','project_team:create'),('COMPANY_OWNER','project_team:read'),('COMPANY_OWNER','project_team:update'),('COMPANY_OWNER','project_team:delete'),('COMPANY_OWNER','milestone:create'),('COMPANY_OWNER','milestone:read'),('COMPANY_OWNER','milestone:update'),('COMPANY_OWNER','milestone:delete'),
 ('COMPANY_ADMIN','project:create'),('COMPANY_ADMIN','project:read'),('COMPANY_ADMIN','project:update'),('COMPANY_ADMIN','project:delete'),('COMPANY_ADMIN','site:create'),('COMPANY_ADMIN','site:read'),('COMPANY_ADMIN','site:update'),('COMPANY_ADMIN','site:delete'),('COMPANY_ADMIN','project_team:create'),('COMPANY_ADMIN','project_team:read'),('COMPANY_ADMIN','project_team:update'),('COMPANY_ADMIN','project_team:delete'),('COMPANY_ADMIN','milestone:create'),('COMPANY_ADMIN','milestone:read'),('COMPANY_ADMIN','milestone:update'),('COMPANY_ADMIN','milestone:delete'),
 ('DIRECTOR','project:create'),('DIRECTOR','project:read'),('DIRECTOR','project:update'),('DIRECTOR','site:create'),('DIRECTOR','site:read'),('DIRECTOR','site:update'),('DIRECTOR','project_team:create'),('DIRECTOR','project_team:read'),('DIRECTOR','project_team:update'),('DIRECTOR','milestone:create'),('DIRECTOR','milestone:read'),('DIRECTOR','milestone:update'),
 ('PROJECT_MANAGER','project:read'),('PROJECT_MANAGER','project:update'),('PROJECT_MANAGER','site:create'),('PROJECT_MANAGER','site:read'),('PROJECT_MANAGER','site:update'),('PROJECT_MANAGER','project_team:create'),('PROJECT_MANAGER','project_team:read'),('PROJECT_MANAGER','project_team:update'),('PROJECT_MANAGER','milestone:create'),('PROJECT_MANAGER','milestone:read'),('PROJECT_MANAGER','milestone:update'),
 ('SITE_ENGINEER','project:read'),('SITE_ENGINEER','site:read'),('SITE_ENGINEER','site:update'),('SITE_ENGINEER','project_team:read'),('SITE_ENGINEER','milestone:create'),('SITE_ENGINEER','milestone:read'),('SITE_ENGINEER','milestone:update'),
 ('SITE_SUPERVISOR','project:read'),('SITE_SUPERVISOR','site:read'),('SITE_SUPERVISOR','project_team:read'),('SITE_SUPERVISOR','milestone:read'),
 ('ACCOUNTANT','project:read'),('ACCOUNTANT','site:read'),('ACCOUNTANT','milestone:read'),
 ('STOREKEEPER','project:read'),('STOREKEEPER','site:read'),('STOREKEEPER','milestone:read'),
 ('HR_MANAGER','project:read'),('HR_MANAGER','site:read'),('HR_MANAGER','project_team:read'),('HR_MANAGER','milestone:read'),
 ('WORKER','project:read'),('WORKER','site:read'),('WORKER','milestone:read'),
 ('CLIENT','project:read'),('CLIENT','site:read'),('CLIENT','milestone:read')
on conflict do nothing;
