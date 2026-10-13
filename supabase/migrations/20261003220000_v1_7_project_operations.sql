-- HySmart Build V1.7: Project Operations & Control Center
-- Extends the existing project model without changing existing status values.

alter table public.projects
  add column if not exists lifecycle_phase text not null default 'PRECONSTRUCTION',
  add column if not exists priority text not null default 'NORMAL',
  add column if not exists health_status text not null default 'GREEN',
  add column if not exists currency text not null default 'NGN',
  add column if not exists contract_value numeric(18,2) not null default 0,
  add column if not exists client_contact text,
  add column if not exists project_manager_user_id uuid,
  add column if not exists notes text;

alter table public.projects drop constraint if exists projects_lifecycle_phase_check;
alter table public.projects add constraint projects_lifecycle_phase_check check (lifecycle_phase in ('PRECONSTRUCTION','MOBILIZATION','CONSTRUCTION','CLOSEOUT','DEFECTS_LIABILITY'));
alter table public.projects drop constraint if exists projects_priority_check;
alter table public.projects add constraint projects_priority_check check (priority in ('LOW','NORMAL','HIGH','CRITICAL'));
alter table public.projects drop constraint if exists projects_health_status_check;
alter table public.projects add constraint projects_health_status_check check (health_status in ('GREEN','AMBER','RED'));
alter table public.projects drop constraint if exists projects_contract_value_check;
alter table public.projects add constraint projects_contract_value_check check (contract_value >= 0);

create index if not exists projects_company_health_idx on public.projects(company_id,health_status);
create index if not exists projects_company_phase_idx on public.projects(company_id,lifecycle_phase);

create table if not exists public.project_status_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  from_status text,
  to_status text not null,
  reason text,
  changed_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists project_status_history_idx on public.project_status_history(company_id,project_id,created_at desc);

create table if not exists public.project_budget_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  cost_code text,
  category text not null,
  description text not null,
  budget_amount numeric(18,2) not null default 0 check (budget_amount >= 0),
  committed_amount numeric(18,2) not null default 0 check (committed_amount >= 0),
  actual_amount numeric(18,2) not null default 0 check (actual_amount >= 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists project_budget_lines_idx on public.project_budget_lines(company_id,project_id);

create table if not exists public.project_risks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  description text,
  probability integer not null default 3 check (probability between 1 and 5),
  impact integer not null default 3 check (impact between 1 and 5),
  status text not null default 'OPEN' check (status in ('OPEN','MITIGATING','CLOSED')),
  mitigation text,
  owner_user_id uuid references auth.users(id),
  due_date date,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists project_risks_idx on public.project_risks(company_id,project_id,status);

create table if not exists public.project_change_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  change_no text not null,
  title text not null,
  description text,
  amount numeric(18,2) not null default 0,
  status text not null default 'DRAFT' check (status in ('DRAFT','SUBMITTED','APPROVED','REJECTED','CANCELLED')),
  requested_date date not null default current_date,
  approved_date date,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id,change_no)
);
create index if not exists project_change_orders_idx on public.project_change_orders(company_id,project_id,status);

create table if not exists public.project_checklists (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  phase text not null,
  title text not null,
  description text,
  status text not null default 'OPEN' check (status in ('OPEN','IN_PROGRESS','DONE','SKIPPED')),
  due_date date,
  assigned_to uuid references auth.users(id),
  completed_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists project_checklists_idx on public.project_checklists(company_id,project_id,status);

alter table public.project_status_history enable row level security;
alter table public.project_budget_lines enable row level security;
alter table public.project_risks enable row level security;
alter table public.project_change_orders enable row level security;
alter table public.project_checklists enable row level security;

drop policy if exists project_status_history_member_select on public.project_status_history;
create policy project_status_history_member_select on public.project_status_history for select using (public.is_company_member(company_id));
drop policy if exists project_budget_lines_member_all on public.project_budget_lines;
create policy project_budget_lines_member_all on public.project_budget_lines for all using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));
drop policy if exists project_risks_member_all on public.project_risks;
create policy project_risks_member_all on public.project_risks for all using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));
drop policy if exists project_change_orders_member_all on public.project_change_orders;
create policy project_change_orders_member_all on public.project_change_orders for all using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));
drop policy if exists project_checklists_member_all on public.project_checklists;
create policy project_checklists_member_all on public.project_checklists for all using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));

create or replace function public.project_status_transition_allowed(p_from text,p_to text)
returns boolean language sql immutable as $$
  select case
    when p_from = p_to then true
    when p_from='PLANNING' and p_to in ('ACTIVE','CANCELLED') then true
    when p_from='ACTIVE' and p_to in ('ON_HOLD','COMPLETED','CANCELLED') then true
    when p_from='ON_HOLD' and p_to in ('ACTIVE','COMPLETED','CANCELLED') then true
    else false
  end;
$$;

create or replace function public.start_project(p_company_id uuid,p_project_id uuid,p_user_id uuid,p_reason text default null)
returns public.projects
language plpgsql security definer set search_path=public as $$
declare v public.projects;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then raise exception 'AUTH_IDENTITY_MISMATCH' using errcode='42501'; end if;
  if not public.is_company_member(p_company_id) then raise exception 'COMPANY_ACCESS_DENIED' using errcode='42501'; end if;
  if not public.has_company_permission(p_company_id,'project:transition') then raise exception 'PROJECT_TRANSITION_PERMISSION_DENIED' using errcode='42501'; end if;
  select * into v from public.projects where company_id=p_company_id and id=p_project_id for update;
  if not found then raise exception 'PROJECT_NOT_FOUND' using errcode='P0002'; end if;
  if not public.project_status_transition_allowed(v.status,'ACTIVE') then raise exception 'INVALID_PROJECT_TRANSITION' using errcode='55000'; end if;
  update public.projects set status='ACTIVE', start_date=coalesce(start_date,current_date), updated_at=now() where company_id=p_company_id and id=p_project_id returning * into v;
  insert into public.project_status_history(company_id,project_id,from_status,to_status,reason,changed_by) values(p_company_id,p_project_id,'PLANNING','ACTIVE',nullif(trim(p_reason),''),p_user_id);
  return v;
end; $$;
revoke all on function public.start_project(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.start_project(uuid,uuid,uuid,text) to authenticated;

insert into public.permissions(key,description) values
('project:transition','Start, pause, complete or cancel projects'),
('project:control','Manage project budget lines, risks, change orders and checklists')
on conflict(key) do update set description=excluded.description;

delete from public.role_permissions where permission_key in ('project:transition','project:control');
insert into public.role_permissions(role,permission_key) values
('SUPER_ADMIN','project:transition'),('SUPER_ADMIN','project:control'),
('COMPANY_OWNER','project:transition'),('COMPANY_OWNER','project:control'),
('COMPANY_ADMIN','project:transition'),('COMPANY_ADMIN','project:control'),
('DIRECTOR','project:transition'),('DIRECTOR','project:control'),
('PROJECT_MANAGER','project:transition'),('PROJECT_MANAGER','project:control')
on conflict do nothing;

notify pgrst,'reload schema';
