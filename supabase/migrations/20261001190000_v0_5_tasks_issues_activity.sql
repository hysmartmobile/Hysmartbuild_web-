-- V0.5: tasks, issues and immutable project activity feed.
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  site_id uuid references public.sites(id) on delete set null,
  milestone_id uuid references public.milestones(id) on delete set null,
  title text not null,
  description text,
  assigned_to uuid references auth.users(id) on delete set null,
  priority text not null default 'MEDIUM' check (priority in ('LOW','MEDIUM','HIGH','URGENT')),
  status text not null default 'TODO' check (status in ('TODO','IN_PROGRESS','BLOCKED','COMPLETED','CANCELLED')),
  due_date date,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.issues (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  site_id uuid references public.sites(id) on delete set null,
  title text not null,
  description text,
  severity text not null default 'MEDIUM' check (severity in ('LOW','MEDIUM','HIGH','CRITICAL')),
  status text not null default 'OPEN' check (status in ('OPEN','IN_PROGRESS','RESOLVED','CLOSED')),
  assigned_to uuid references auth.users(id) on delete set null,
  due_date date,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_activity (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id),
  entity_type text not null check (entity_type in ('PROJECT','TASK','ISSUE','MILESTONE','SITE','TEAM')),
  entity_id uuid,
  action text not null check (action in ('CREATED','UPDATED','STATUS_CHANGED','ASSIGNED','DELETED','COMMENTED')),
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index tasks_company_project_idx on public.tasks(company_id,project_id);
create index tasks_assignee_idx on public.tasks(company_id,assigned_to);
create index tasks_status_idx on public.tasks(company_id,status);
create index tasks_due_idx on public.tasks(project_id,due_date);
create index issues_company_project_idx on public.issues(company_id,project_id);
create index issues_status_idx on public.issues(company_id,status);
create index issues_assignee_idx on public.issues(company_id,assigned_to);
create index activity_company_project_created_idx on public.project_activity(company_id,project_id,created_at desc);

create trigger tasks_updated_at before update on public.tasks for each row execute procedure public.set_updated_at();
create trigger issues_updated_at before update on public.issues for each row execute procedure public.set_updated_at();

alter table public.tasks enable row level security;
alter table public.issues enable row level security;
alter table public.project_activity enable row level security;

create policy tasks_member_select on public.tasks for select using (public.is_company_member(company_id));
create policy tasks_member_insert on public.tasks for insert with check (public.is_company_member(company_id) and created_by = auth.uid());
create policy tasks_member_update on public.tasks for update using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));
create policy tasks_member_delete on public.tasks for delete using (public.is_company_member(company_id));

create policy issues_member_select on public.issues for select using (public.is_company_member(company_id));
create policy issues_member_insert on public.issues for insert with check (public.is_company_member(company_id) and created_by = auth.uid());
create policy issues_member_update on public.issues for update using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));
create policy issues_member_delete on public.issues for delete using (public.is_company_member(company_id));

create policy activity_member_select on public.project_activity for select using (public.is_company_member(company_id));
create policy activity_member_insert on public.project_activity for insert with check (public.is_company_member(company_id) and actor_user_id = auth.uid());
-- Activity is append-only at the database policy level.
revoke update, delete on public.project_activity from authenticated;

insert into public.permissions(key,description) values
 ('task:create','Create project tasks'),('task:read','Read project tasks'),('task:update','Update project tasks'),('task:delete','Delete project tasks'),
 ('issue:create','Create project issues'),('issue:read','Read project issues'),('issue:update','Update project issues'),('issue:delete','Delete project issues'),
 ('activity:read','Read project activity')
on conflict (key) do nothing;

insert into public.role_permissions(role,permission_key) values
 ('SUPER_ADMIN','task:create'),('SUPER_ADMIN','task:read'),('SUPER_ADMIN','task:update'),('SUPER_ADMIN','task:delete'),('SUPER_ADMIN','issue:create'),('SUPER_ADMIN','issue:read'),('SUPER_ADMIN','issue:update'),('SUPER_ADMIN','issue:delete'),('SUPER_ADMIN','activity:read'),
 ('COMPANY_OWNER','task:create'),('COMPANY_OWNER','task:read'),('COMPANY_OWNER','task:update'),('COMPANY_OWNER','task:delete'),('COMPANY_OWNER','issue:create'),('COMPANY_OWNER','issue:read'),('COMPANY_OWNER','issue:update'),('COMPANY_OWNER','issue:delete'),('COMPANY_OWNER','activity:read'),
 ('COMPANY_ADMIN','task:create'),('COMPANY_ADMIN','task:read'),('COMPANY_ADMIN','task:update'),('COMPANY_ADMIN','task:delete'),('COMPANY_ADMIN','issue:create'),('COMPANY_ADMIN','issue:read'),('COMPANY_ADMIN','issue:update'),('COMPANY_ADMIN','issue:delete'),('COMPANY_ADMIN','activity:read'),
 ('DIRECTOR','task:create'),('DIRECTOR','task:read'),('DIRECTOR','task:update'),('DIRECTOR','issue:create'),('DIRECTOR','issue:read'),('DIRECTOR','issue:update'),('DIRECTOR','activity:read'),
 ('PROJECT_MANAGER','task:create'),('PROJECT_MANAGER','task:read'),('PROJECT_MANAGER','task:update'),('PROJECT_MANAGER','task:delete'),('PROJECT_MANAGER','issue:create'),('PROJECT_MANAGER','issue:read'),('PROJECT_MANAGER','issue:update'),('PROJECT_MANAGER','activity:read'),
 ('SITE_ENGINEER','task:create'),('SITE_ENGINEER','task:read'),('SITE_ENGINEER','task:update'),('SITE_ENGINEER','issue:create'),('SITE_ENGINEER','issue:read'),('SITE_ENGINEER','issue:update'),('SITE_ENGINEER','activity:read'),
 ('SITE_SUPERVISOR','task:create'),('SITE_SUPERVISOR','task:read'),('SITE_SUPERVISOR','task:update'),('SITE_SUPERVISOR','issue:create'),('SITE_SUPERVISOR','issue:read'),('SITE_SUPERVISOR','issue:update'),('SITE_SUPERVISOR','activity:read'),
 ('ACCOUNTANT','task:read'),('ACCOUNTANT','issue:read'),('ACCOUNTANT','activity:read'),
 ('STOREKEEPER','task:read'),('STOREKEEPER','issue:read'),('STOREKEEPER','activity:read'),
 ('HR_MANAGER','task:read'),('HR_MANAGER','issue:read'),('HR_MANAGER','activity:read'),
 ('WORKER','task:read'),('WORKER','issue:read'),('WORKER','activity:read'),
 ('CLIENT','task:read'),('CLIENT','issue:read'),('CLIENT','activity:read')
on conflict do nothing;
