begin;

alter table public.materials add constraint materials_company_id_id_unique_v24 unique(company_id,id);

create table if not exists public.project_material_plans (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  material_id uuid not null references public.materials(id) on delete restrict,
  estimate_item_id uuid references public.project_estimate_items(id) on delete set null,
  required_by date,
  planned_quantity numeric(20,4) not null check(planned_quantity > 0),
  planned_unit_cost numeric(20,4) not null default 0 check(planned_unit_cost >= 0),
  wastage_allowance_percent numeric(8,4) not null default 0 check(wastage_allowance_percent between 0 and 100),
  lead_time_days integer not null default 0 check(lead_time_days >= 0),
  status text not null default 'PLANNED' check(status in ('PLANNED','ORDERED','PARTIALLY_RECEIVED','RECEIVED','CANCELLED')),
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id,id)
);

create table if not exists public.project_productivity_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  site_id uuid references public.sites(id) on delete set null,
  estimate_item_id uuid references public.project_estimate_items(id) on delete set null,
  trade text,
  work_date date not null default current_date,
  worker_count numeric(12,2) not null default 0 check(worker_count >= 0),
  labour_hours numeric(14,2) not null default 0 check(labour_hours >= 0),
  quantity_completed numeric(20,4) not null check(quantity_completed >= 0),
  unit text,
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.project_material_plans add constraint project_material_plan_material_tenant_fk foreign key(company_id,material_id) references public.materials(company_id,id) on delete restrict;
alter table public.project_material_plans add constraint project_material_plan_project_tenant_fk foreign key(company_id,project_id) references public.projects(company_id,id) on delete cascade;
alter table public.project_material_plans add constraint project_material_plan_estimate_tenant_fk foreign key(company_id,estimate_item_id) references public.project_estimate_items(company_id,id) on delete set null;
alter table public.project_productivity_records add constraint productivity_project_tenant_fk foreign key(company_id,project_id) references public.projects(company_id,id) on delete cascade;
alter table public.project_productivity_records add constraint productivity_site_tenant_fk foreign key(company_id,site_id) references public.sites(company_id,id) on delete set null;
alter table public.project_productivity_records add constraint productivity_estimate_tenant_fk foreign key(company_id,estimate_item_id) references public.project_estimate_items(company_id,id) on delete set null;

create or replace function public.validate_v24_project_material_plan() returns trigger language plpgsql as $$
declare item_project uuid;
begin
  if new.estimate_item_id is not null then
    select e.project_id into item_project from public.project_estimate_items i join public.project_estimates e on e.company_id=i.company_id and e.id=i.estimate_id where i.company_id=new.company_id and i.id=new.estimate_item_id;
    if item_project is null or item_project <> new.project_id then raise exception 'Estimate item does not belong to material plan project' using errcode='23514'; end if;
  end if;
  return new;
end; $$;
drop trigger if exists validate_v24_project_material_plan on public.project_material_plans;
create trigger validate_v24_project_material_plan before insert or update of company_id,project_id,estimate_item_id on public.project_material_plans for each row execute function public.validate_v24_project_material_plan();

create or replace function public.validate_v24_productivity_record() returns trigger language plpgsql as $$
declare item_project uuid; site_project uuid;
begin
  if new.estimate_item_id is not null then
    select e.project_id into item_project from public.project_estimate_items i join public.project_estimates e on e.company_id=i.company_id and e.id=i.estimate_id where i.company_id=new.company_id and i.id=new.estimate_item_id;
    if item_project is null or item_project <> new.project_id then raise exception 'Estimate item does not belong to productivity project' using errcode='23514'; end if;
  end if;
  if new.site_id is not null then
    select project_id into site_project from public.sites where company_id=new.company_id and id=new.site_id;
    if site_project is not null and site_project <> new.project_id then raise exception 'Site does not belong to productivity project' using errcode='23514'; end if;
  end if;
  return new;
end; $$;
drop trigger if exists validate_v24_productivity_record on public.project_productivity_records;
create trigger validate_v24_productivity_record before insert or update of company_id,project_id,site_id,estimate_item_id on public.project_productivity_records for each row execute function public.validate_v24_productivity_record();

create index if not exists project_material_plans_project_status_idx on public.project_material_plans(company_id,project_id,status,required_by);
create index if not exists project_material_plans_material_idx on public.project_material_plans(company_id,project_id,material_id);
create index if not exists project_productivity_project_date_idx on public.project_productivity_records(company_id,project_id,work_date desc);
create index if not exists project_productivity_item_date_idx on public.project_productivity_records(company_id,project_id,estimate_item_id,work_date desc);

alter table public.project_material_plans enable row level security;
alter table public.project_productivity_records enable row level security;
drop policy if exists project_material_plans_member_all on public.project_material_plans;
create policy project_material_plans_member_all on public.project_material_plans for all using(public.is_company_member(company_id)) with check(public.is_company_member(company_id));
drop policy if exists project_productivity_records_member_all on public.project_productivity_records;
create policy project_productivity_records_member_all on public.project_productivity_records for all using(public.is_company_member(company_id)) with check(public.is_company_member(company_id));

insert into public.permissions(key,description) values
('site-intelligence:read','View material planning, procurement risk and site productivity intelligence'),
('site-intelligence:manage','Manage material plans and site productivity records')
on conflict(key) do update set description=excluded.description;
delete from public.role_permissions where permission_key in ('site-intelligence:read','site-intelligence:manage');
insert into public.role_permissions(role,permission_key) values
('SUPER_ADMIN','site-intelligence:read'),('SUPER_ADMIN','site-intelligence:manage'),
('COMPANY_OWNER','site-intelligence:read'),('COMPANY_OWNER','site-intelligence:manage'),
('COMPANY_ADMIN','site-intelligence:read'),('COMPANY_ADMIN','site-intelligence:manage'),
('DIRECTOR','site-intelligence:read'),('DIRECTOR','site-intelligence:manage'),
('PROJECT_MANAGER','site-intelligence:read'),('PROJECT_MANAGER','site-intelligence:manage'),
('SITE_ENGINEER','site-intelligence:read'),('SITE_ENGINEER','site-intelligence:manage'),
('SITE_SUPERVISOR','site-intelligence:read'),('SITE_SUPERVISOR','site-intelligence:manage'),
('STOREKEEPER','site-intelligence:read'),('STOREKEEPER','site-intelligence:manage'),
('ACCOUNTANT','site-intelligence:read');

notify pgrst, 'reload schema';
commit;
