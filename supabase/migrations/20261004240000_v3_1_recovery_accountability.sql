begin;
create table if not exists public.project_recovery_plans (
 id uuid primary key, company_id uuid not null references public.companies(id) on delete cascade, project_id uuid not null references public.projects(id) on delete cascade,
 title text not null, objective text, status text not null default 'PLANNED' check(status in ('PLANNED','ACTIVE','ON_TRACK','AT_RISK','COMPLETED','CANCELLED')),
 priority text not null default 'HIGH' check(priority in ('LOW','MEDIUM','HIGH','CRITICAL')), owner_user_id uuid, target_finish_date date, target_cost_variance numeric(18,2), review_date date,
 created_by uuid, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.project_recovery_plans add constraint project_recovery_plans_company_id_unique unique(company_id,id);
alter table public.project_recovery_plans add constraint recovery_plan_project_tenant_fk foreign key(company_id,project_id) references public.projects(company_id,id) on delete cascade;
create index if not exists idx_recovery_plans_company_project on public.project_recovery_plans(company_id,project_id,status);
create table if not exists public.recovery_plan_actions (
 id uuid primary key, company_id uuid not null references public.companies(id) on delete cascade, plan_id uuid not null references public.project_recovery_plans(id) on delete cascade,
 workflow_action_id uuid not null references public.workflow_action_items(id) on delete cascade, created_by uuid, created_at timestamptz not null default now(), unique(plan_id,workflow_action_id)
);
alter table public.recovery_plan_actions add constraint recovery_plan_actions_plan_tenant_fk foreign key(company_id,plan_id) references public.project_recovery_plans(company_id,id) on delete cascade;
alter table public.recovery_plan_actions add constraint recovery_plan_actions_workflow_tenant_fk foreign key(company_id,workflow_action_id) references public.workflow_action_items(company_id,id) on delete cascade;
create index if not exists idx_recovery_plan_actions_company on public.recovery_plan_actions(company_id,plan_id);
create table if not exists public.recovery_plan_reviews (
 id uuid primary key, company_id uuid not null references public.companies(id) on delete cascade, plan_id uuid not null references public.project_recovery_plans(id) on delete cascade,
 reviewed_by uuid, health_score numeric(8,2), health_status text, schedule_variance_days numeric(12,2), cost_variance numeric(18,2), progress numeric(8,2), open_actions integer not null default 0, overdue_actions integer not null default 0, notes text, reviewed_at timestamptz not null default now()
);
alter table public.recovery_plan_reviews add constraint recovery_plan_reviews_plan_tenant_fk foreign key(company_id,plan_id) references public.project_recovery_plans(company_id,id) on delete cascade;
create index if not exists idx_recovery_reviews_plan on public.recovery_plan_reviews(company_id,plan_id,reviewed_at desc);

alter table public.project_recovery_plans enable row level security;
alter table public.recovery_plan_actions enable row level security;
alter table public.recovery_plan_reviews enable row level security;
drop policy if exists recovery_plans_tenant on public.project_recovery_plans;
drop policy if exists recovery_actions_tenant on public.recovery_plan_actions;
drop policy if exists recovery_reviews_tenant on public.recovery_plan_reviews;
create policy recovery_plans_tenant on public.project_recovery_plans for all using (company_id = public.current_company_id()) with check (company_id = public.current_company_id());
create policy recovery_actions_tenant on public.recovery_plan_actions for all using (company_id = public.current_company_id()) with check (company_id = public.current_company_id());
create policy recovery_reviews_tenant on public.recovery_plan_reviews for all using (company_id = public.current_company_id()) with check (company_id = public.current_company_id());

insert into public.permissions(key,description) values ('recovery:read','View project recovery plans and reviews'),('recovery:manage','Create, update and review project recovery plans') on conflict(key) do update set description=excluded.description;
delete from public.role_permissions where permission_key in ('recovery:read','recovery:manage');
insert into public.role_permissions(role,permission_key) values
('SUPER_ADMIN','recovery:read'),('SUPER_ADMIN','recovery:manage'),('COMPANY_OWNER','recovery:read'),('COMPANY_OWNER','recovery:manage'),('COMPANY_ADMIN','recovery:read'),('COMPANY_ADMIN','recovery:manage'),('DIRECTOR','recovery:read'),('DIRECTOR','recovery:manage'),('PROJECT_MANAGER','recovery:read'),('PROJECT_MANAGER','recovery:manage');
notify pgrst,'reload schema';
commit;
