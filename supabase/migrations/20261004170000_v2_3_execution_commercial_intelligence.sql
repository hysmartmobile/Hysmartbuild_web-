begin;

alter table public.project_schedule_activities add column if not exists estimate_item_id uuid references public.project_estimate_items(id) on delete set null;
alter table public.project_schedule_activities add column if not exists planned_quantity numeric(20,4) not null default 0 check(planned_quantity >= 0);
alter table public.project_schedule_activities add column if not exists unit text;
alter table public.project_schedule_activities add column if not exists planned_value numeric(20,4) not null default 0 check(planned_value >= 0);
alter table public.project_schedule_activities add constraint project_schedule_activity_estimate_item_tenant_fk foreign key(company_id,estimate_item_id) references public.project_estimate_items(company_id,id) on delete set null;
create or replace function public.validate_schedule_activity_estimate_item_project() returns trigger language plpgsql as $$
declare item_project uuid;
begin
  if new.estimate_item_id is null then return new; end if;
  select e.project_id into item_project
  from public.project_estimate_items i
  join public.project_estimates e on e.company_id=i.company_id and e.id=i.estimate_id
  where i.company_id=new.company_id and i.id=new.estimate_item_id;
  if item_project is null or item_project <> new.project_id then
    raise exception 'Estimate item does not belong to the schedule project' using errcode='23514';
  end if;
  return new;
end; $$;
drop trigger if exists validate_schedule_activity_estimate_item_project on public.project_schedule_activities;
create trigger validate_schedule_activity_estimate_item_project before insert or update of estimate_item_id,project_id,company_id on public.project_schedule_activities for each row execute function public.validate_schedule_activity_estimate_item_project();

create index if not exists project_schedule_activities_estimate_item_idx on public.project_schedule_activities(company_id,project_id,estimate_item_id);
create index if not exists project_progress_measurements_item_status_idx on public.project_progress_measurements(company_id,project_id,estimate_item_id,status,measurement_date desc);
create index if not exists inventory_transactions_project_material_idx on public.inventory_transactions(company_id,project_id,material_id,created_at desc);
create index if not exists accounts_receivable_project_status_idx on public.accounts_receivable_invoices(company_id,project_id,status,due_date);

create table if not exists public.project_execution_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  snapshot_date date not null default current_date,
  planned_value numeric(20,4) not null default 0,
  earned_value numeric(20,4) not null default 0,
  actual_cost numeric(20,4) not null default 0,
  committed_cost numeric(20,4) not null default 0,
  schedule_index numeric(12,6),
  cost_index numeric(12,6),
  forecast_cost numeric(20,4),
  forecast_finish date,
  schedule_variance_days integer not null default 0,
  cost_variance numeric(20,4) not null default 0,
  progress_percent numeric(8,4) not null default 0,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique(company_id,project_id,snapshot_date)
);
create index if not exists project_execution_snapshots_project_date_idx on public.project_execution_snapshots(company_id,project_id,snapshot_date desc);
alter table public.project_execution_snapshots enable row level security;
drop policy if exists project_execution_snapshots_member_all on public.project_execution_snapshots;
create policy project_execution_snapshots_member_all on public.project_execution_snapshots for all using(public.is_company_member(company_id)) with check(public.is_company_member(company_id));

insert into public.permissions(key,description) values
('execution:read','View execution, earned-value, productivity, cash exposure and management alerts'),
('execution:manage','Record production measurements and execution snapshots')
on conflict(key) do update set description=excluded.description;
delete from public.role_permissions where permission_key in ('execution:read','execution:manage');
insert into public.role_permissions(role,permission_key) values
('SUPER_ADMIN','execution:read'),('SUPER_ADMIN','execution:manage'),
('COMPANY_OWNER','execution:read'),('COMPANY_OWNER','execution:manage'),
('COMPANY_ADMIN','execution:read'),('COMPANY_ADMIN','execution:manage'),
('DIRECTOR','execution:read'),('DIRECTOR','execution:manage'),
('PROJECT_MANAGER','execution:read'),('PROJECT_MANAGER','execution:manage'),
('SITE_ENGINEER','execution:read'),('SITE_ENGINEER','execution:manage'),
('SITE_SUPERVISOR','execution:read'),('SITE_SUPERVISOR','execution:manage'),
('ACCOUNTANT','execution:read');

notify pgrst, 'reload schema';
commit;
