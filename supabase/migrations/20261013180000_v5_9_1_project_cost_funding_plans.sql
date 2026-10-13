begin;

create table if not exists public.project_cost_plans (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  currency text not null default 'NGN' check (char_length(currency) = 3),
  inputs jsonb not null default '{}'::jsonb,
  forecast jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists project_cost_plans_company_project_created_idx
  on public.project_cost_plans(company_id, project_id, created_at desc);
alter table public.project_cost_plans enable row level security;
drop policy if exists project_cost_plans_no_direct_client_access on public.project_cost_plans;
create policy project_cost_plans_no_direct_client_access on public.project_cost_plans
  for all to authenticated using (false) with check (false);

insert into public.permissions(key, description) values
 ('project-cost-plan:read', 'Read project cost, margin and funding forecasts'),
 ('project-cost-plan:manage', 'Create and save project cost, margin and funding plans')
on conflict(key) do update set description = excluded.description;

delete from public.role_permissions where permission_key in ('project-cost-plan:read','project-cost-plan:manage');
insert into public.role_permissions(role, permission_key) values
 ('SUPER_ADMIN','project-cost-plan:read'),('COMPANY_OWNER','project-cost-plan:read'),('COMPANY_ADMIN','project-cost-plan:read'),
 ('DIRECTOR','project-cost-plan:read'),('PROJECT_MANAGER','project-cost-plan:read'),('ACCOUNTANT','project-cost-plan:read'),
 ('CEO','project-cost-plan:read'),('MANAGEMENT','project-cost-plan:read'),('COMMERCIAL_MANAGER','project-cost-plan:read'),('QUANTITY_SURVEYOR','project-cost-plan:read');
insert into public.role_permissions(role, permission_key) values
 ('SUPER_ADMIN','project-cost-plan:manage'),('COMPANY_OWNER','project-cost-plan:manage'),('COMPANY_ADMIN','project-cost-plan:manage'),
 ('DIRECTOR','project-cost-plan:manage'),('PROJECT_MANAGER','project-cost-plan:manage'),('ACCOUNTANT','project-cost-plan:manage'),
 ('CEO','project-cost-plan:manage'),('MANAGEMENT','project-cost-plan:manage'),('COMMERCIAL_MANAGER','project-cost-plan:manage'),('QUANTITY_SURVEYOR','project-cost-plan:manage');

notify pgrst, 'reload schema';
commit;
