create table if not exists public.recovery_field_executions (
 id uuid primary key,
 company_id uuid not null,
 project_id uuid not null,
 plan_id uuid not null,
 commitment_id uuid,
 activity_id uuid,
 execution_date date not null,
 title text not null,
 target_quantity numeric,
 actual_quantity numeric,
 unit text,
 status text not null default 'OPEN' check(status in ('OPEN','IN_PROGRESS','ACHIEVED','MISSED','CANCELLED')),
 owner_user_id uuid,
 evidence_note text,
 daily_report_id uuid,
 created_by uuid not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key(company_id,project_id) references public.projects(company_id,id) on delete cascade,
 foreign key(company_id,plan_id) references public.project_recovery_plans(company_id,id) on delete cascade,
 foreign key(company_id,commitment_id) references public.recovery_plan_commitments(company_id,id) on delete set null,
 foreign key(company_id,activity_id) references public.project_schedule_activities(company_id,id) on delete set null,
 foreign key(company_id,daily_report_id) references public.daily_site_reports(company_id,id) on delete set null
);
create index if not exists recovery_field_execution_plan_idx on public.recovery_field_executions(company_id,plan_id,execution_date desc);
create index if not exists recovery_field_execution_activity_idx on public.recovery_field_executions(company_id,project_id,activity_id,execution_date desc);
alter table public.recovery_field_executions enable row level security;
drop policy if exists recovery_field_executions_member_all on public.recovery_field_executions;
create policy recovery_field_executions_member_all on public.recovery_field_executions for all using(public.is_company_member(company_id)) with check(public.is_company_member(company_id));

insert into public.permissions(key,description) values
 ('recovery:execute','Execute field recovery interventions')
on conflict(key) do update set description=excluded.description;
insert into public.role_permissions(role,permission_key)
select r.role,'recovery:execute' from (values ('SUPER_ADMIN'),('COMPANY_OWNER'),('COMPANY_ADMIN'),('DIRECTOR'),('PROJECT_MANAGER'),('SITE_ENGINEER'),('SITE_SUPERVISOR')) r(role)
on conflict do nothing;
