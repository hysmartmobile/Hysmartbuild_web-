begin;
create table if not exists public.recovery_plan_commitments (
 id uuid primary key,
 company_id uuid not null references public.companies(id) on delete cascade,
 plan_id uuid not null references public.project_recovery_plans(id) on delete cascade,
 title text not null,
 intervention_type text not null default 'GENERAL' check(intervention_type in ('SCHEDULE','COST','CASH','PROCUREMENT','SUBCONTRACTOR','QUALITY','CLIENT','GENERAL')),
 owner_user_id uuid,
 due_date date not null,
 target_value numeric(18,2),
 unit text,
 status text not null default 'OPEN' check(status in ('OPEN','DONE','MISSED','CANCELLED')),
 outcome text,
 completed_at timestamptz,
 created_by uuid,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.recovery_plan_commitments add constraint recovery_commitments_plan_tenant_fk foreign key(company_id,plan_id) references public.project_recovery_plans(company_id,id) on delete cascade;
create index if not exists idx_recovery_commitments_plan_status on public.recovery_plan_commitments(company_id,plan_id,status,due_date);
create index if not exists idx_recovery_commitments_due on public.recovery_plan_commitments(company_id,due_date,status);
alter table public.recovery_plan_commitments enable row level security;
drop policy if exists recovery_commitments_tenant on public.recovery_plan_commitments;
create policy recovery_commitments_tenant on public.recovery_plan_commitments for all using (company_id = public.current_company_id()) with check (company_id = public.current_company_id());
notify pgrst,'reload schema';
commit;
