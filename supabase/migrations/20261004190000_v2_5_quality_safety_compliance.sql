begin;

create table if not exists public.quality_checklist_templates (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  name text not null, discipline text, version text not null default '1.0', active boolean not null default true,
  items jsonb not null default '[]'::jsonb, created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(company_id,id)
);
create table if not exists public.quality_inspections (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade, site_id uuid references public.sites(id) on delete set null,
  template_id uuid references public.quality_checklist_templates(id) on delete set null, inspection_no text not null,
  title text not null, discipline text, inspection_date date not null default current_date,
  status text not null default 'DRAFT' check(status in ('DRAFT','SUBMITTED','PASSED','FAILED','CLOSED')),
  score numeric(8,2), findings text, evidence jsonb not null default '[]'::jsonb,
  inspected_by uuid not null references auth.users(id), approved_by uuid references auth.users(id), approved_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(company_id,inspection_no), unique(company_id,id)
);
create table if not exists public.quality_inspection_items (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  inspection_id uuid not null references public.quality_inspections(id) on delete cascade, item_key text not null, description text not null,
  requirement text, result text not null default 'PENDING' check(result in ('PENDING','PASS','FAIL','NA')),
  remarks text, evidence jsonb not null default '[]'::jsonb, created_at timestamptz not null default now(), unique(company_id,id)
);
create table if not exists public.quality_ncrs (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade, site_id uuid references public.sites(id) on delete set null,
  inspection_id uuid references public.quality_inspections(id) on delete set null, ncr_no text not null,
  title text not null, description text not null, severity text not null default 'MEDIUM' check(severity in ('LOW','MEDIUM','HIGH','CRITICAL')),
  status text not null default 'OPEN' check(status in ('OPEN','UNDER_REVIEW','CORRECTIVE_ACTION','VERIFICATION','CLOSED','REJECTED')),
  root_cause text, corrective_action text, preventive_action text, responsible_user_id uuid references auth.users(id), due_date date,
  evidence jsonb not null default '[]'::jsonb, closed_at timestamptz, closed_by uuid references auth.users(id), created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(company_id,ncr_no), unique(company_id,id)
);
create table if not exists public.quality_actions (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade, ncr_id uuid references public.quality_ncrs(id) on delete cascade,
  action_type text not null default 'CORRECTIVE' check(action_type in ('CORRECTIVE','PREVENTIVE','SAFETY','QUALITY')),
  title text not null, description text, assigned_to uuid references auth.users(id), due_date date,
  status text not null default 'OPEN' check(status in ('OPEN','IN_PROGRESS','SUBMITTED','VERIFIED','CLOSED','OVERDUE')),
  evidence jsonb not null default '[]'::jsonb, verified_by uuid references auth.users(id), verified_at timestamptz,
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(company_id,id)
);
create table if not exists public.safety_observations (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade, site_id uuid references public.sites(id) on delete set null,
  observation_no text not null, category text not null, severity text not null default 'MEDIUM' check(severity in ('LOW','MEDIUM','HIGH','CRITICAL')),
  title text not null, description text not null, observed_date date not null default current_date,
  status text not null default 'OPEN' check(status in ('OPEN','ACTION_REQUIRED','IN_PROGRESS','CLOSED')),
  responsible_user_id uuid references auth.users(id), due_date date, evidence jsonb not null default '[]'::jsonb,
  created_by uuid not null references auth.users(id), closed_at timestamptz, closed_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(company_id,observation_no), unique(company_id,id)
);
create table if not exists public.safety_incidents (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade, site_id uuid references public.sites(id) on delete set null,
  incident_no text not null, incident_type text not null, severity text not null default 'MEDIUM' check(severity in ('LOW','MEDIUM','HIGH','CRITICAL')),
  title text not null, description text not null, occurred_at timestamptz not null default now(), status text not null default 'OPEN' check(status in ('OPEN','INVESTIGATION','ACTION_REQUIRED','CLOSED')),
  injured_persons integer not null default 0 check(injured_persons >= 0), lost_time boolean not null default false, evidence jsonb not null default '[]'::jsonb,
  root_cause text, corrective_action text, responsible_user_id uuid references auth.users(id), closed_at timestamptz, closed_by uuid references auth.users(id), created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(company_id,incident_no), unique(company_id,id)
);
create table if not exists public.compliance_permits (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade, permit_no text not null, permit_type text not null, authority text,
  issue_date date, expiry_date date, status text not null default 'ACTIVE' check(status in ('PENDING','ACTIVE','EXPIRED','REVOKED')),
  evidence jsonb not null default '[]'::jsonb, responsible_user_id uuid references auth.users(id), notes text, created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(company_id,permit_no), unique(company_id,id)
);
create table if not exists public.quality_audit_events (
  id bigint generated always as identity primary key, company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade, entity_type text not null, entity_id uuid not null, action text not null,
  actor_user_id uuid references auth.users(id), metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);

alter table public.quality_inspections add constraint qinsp_project_tenant_fk foreign key(company_id,project_id) references public.projects(company_id,id) on delete cascade;
alter table public.quality_inspections add constraint qinsp_site_tenant_fk foreign key(company_id,site_id) references public.sites(company_id,id) on delete set null;
alter table public.quality_inspection_items add constraint qitem_inspection_tenant_fk foreign key(company_id,inspection_id) references public.quality_inspections(company_id,id) on delete cascade;
alter table public.quality_ncrs add constraint qncr_project_tenant_fk foreign key(company_id,project_id) references public.projects(company_id,id) on delete cascade;
alter table public.quality_ncrs add constraint qncr_site_tenant_fk foreign key(company_id,site_id) references public.sites(company_id,id) on delete set null;
alter table public.quality_actions add constraint qaction_project_tenant_fk foreign key(company_id,project_id) references public.projects(company_id,id) on delete cascade;
alter table public.quality_actions add constraint qaction_ncr_tenant_fk foreign key(company_id,ncr_id) references public.quality_ncrs(company_id,id) on delete cascade;
alter table public.safety_observations add constraint sobs_project_tenant_fk foreign key(company_id,project_id) references public.projects(company_id,id) on delete cascade;
alter table public.safety_observations add constraint sobs_site_tenant_fk foreign key(company_id,site_id) references public.sites(company_id,id) on delete set null;
alter table public.safety_incidents add constraint sinc_project_tenant_fk foreign key(company_id,project_id) references public.projects(company_id,id) on delete cascade;
alter table public.safety_incidents add constraint sinc_site_tenant_fk foreign key(company_id,site_id) references public.sites(company_id,id) on delete set null;
alter table public.compliance_permits add constraint permit_project_tenant_fk foreign key(company_id,project_id) references public.projects(company_id,id) on delete cascade;

create or replace function public.validate_v25_quality_links() returns trigger language plpgsql as $$
declare p uuid; s uuid;
begin
 if new.site_id is not null then select project_id into s from public.sites where company_id=new.company_id and id=new.site_id; if s is not null and s<>new.project_id then raise exception 'Site does not belong to quality project' using errcode='23514'; end if; end if;
 if tg_table_name='quality_inspection_items' then select project_id into p from public.quality_inspections where company_id=new.company_id and id=new.inspection_id; if p is null then raise exception 'Inspection does not belong to company' using errcode='23514'; end if; end if;
 if tg_table_name='quality_inspections' and new.template_id is not null then if not exists(select 1 from public.quality_checklist_templates where company_id=new.company_id and id=new.template_id) then raise exception 'Checklist template does not belong to company' using errcode='23514'; end if; end if;
 return new;
end; $$;

drop trigger if exists validate_v25_quality_inspections on public.quality_inspections;
create trigger validate_v25_quality_inspections before insert or update of company_id,project_id,site_id,template_id on public.quality_inspections for each row execute function public.validate_v25_quality_links();
drop trigger if exists validate_v25_quality_items on public.quality_inspection_items;
create trigger validate_v25_quality_items before insert or update of company_id,inspection_id on public.quality_inspection_items for each row execute function public.validate_v25_quality_links();
drop trigger if exists validate_v25_quality_ncrs on public.quality_ncrs;
create trigger validate_v25_quality_ncrs before insert or update of company_id,project_id,site_id on public.quality_ncrs for each row execute function public.validate_v25_quality_links();
drop trigger if exists validate_v25_quality_actions on public.quality_actions;
create trigger validate_v25_quality_actions before insert or update of company_id,project_id on public.quality_actions for each row execute function public.validate_v25_quality_links();
drop trigger if exists validate_v25_safety_observations on public.safety_observations;
create trigger validate_v25_safety_observations before insert or update of company_id,project_id,site_id on public.safety_observations for each row execute function public.validate_v25_quality_links();
drop trigger if exists validate_v25_safety_incidents on public.safety_incidents;
create trigger validate_v25_safety_incidents before insert or update of company_id,project_id,site_id on public.safety_incidents for each row execute function public.validate_v25_quality_links();

create index if not exists qinsp_project_status_idx on public.quality_inspections(company_id,project_id,status,inspection_date desc);
create index if not exists qncr_project_status_idx on public.quality_ncrs(company_id,project_id,status,due_date);
create index if not exists qaction_project_status_idx on public.quality_actions(company_id,project_id,status,due_date);
create index if not exists sobs_project_status_idx on public.safety_observations(company_id,project_id,status,due_date);
create index if not exists sinc_project_date_idx on public.safety_incidents(company_id,project_id,occurred_at desc);
create index if not exists permit_project_expiry_idx on public.compliance_permits(company_id,project_id,expiry_date);
create index if not exists qaudit_project_created_idx on public.quality_audit_events(company_id,project_id,created_at desc);

alter table public.quality_checklist_templates enable row level security;
alter table public.quality_inspections enable row level security;
alter table public.quality_inspection_items enable row level security;
alter table public.quality_ncrs enable row level security;
alter table public.quality_actions enable row level security;
alter table public.safety_observations enable row level security;
alter table public.safety_incidents enable row level security;
alter table public.compliance_permits enable row level security;
alter table public.quality_audit_events enable row level security;

do $$ declare t text; begin foreach t in array array['quality_checklist_templates','quality_inspections','quality_inspection_items','quality_ncrs','quality_actions','safety_observations','safety_incidents','compliance_permits'] loop execute format('drop policy if exists %I_member_all on public.%I',t,t); execute format('create policy %I_member_all on public.%I for all using(public.is_company_member(company_id)) with check(public.is_company_member(company_id))',t,t); end loop; end $$;
drop policy if exists quality_audit_events_member_select on public.quality_audit_events;
drop policy if exists quality_audit_events_member_insert on public.quality_audit_events;
create policy quality_audit_events_member_select on public.quality_audit_events for select using(public.is_company_member(company_id));
create policy quality_audit_events_member_insert on public.quality_audit_events for insert with check(public.is_company_member(company_id));

insert into public.permissions(key,description) values
('quality:read','View quality inspections, NCRs and quality dashboards'),('quality:manage','Manage inspections, checklists, NCRs and corrective actions'),('quality:approve','Approve inspections and verify corrective actions'),('safety:read','View safety observations and incidents'),('safety:manage','Manage safety observations and incidents'),('compliance:read','View permits and compliance status'),('compliance:manage','Manage permits and compliance evidence') on conflict(key) do update set description=excluded.description;
delete from public.role_permissions where permission_key in ('quality:read','quality:manage','quality:approve','safety:read','safety:manage','compliance:read','compliance:manage');
insert into public.role_permissions(role,permission_key) values
('SUPER_ADMIN','quality:read'),('SUPER_ADMIN','quality:manage'),('SUPER_ADMIN','quality:approve'),('SUPER_ADMIN','safety:read'),('SUPER_ADMIN','safety:manage'),('SUPER_ADMIN','compliance:read'),('SUPER_ADMIN','compliance:manage'),
('COMPANY_OWNER','quality:read'),('COMPANY_OWNER','quality:manage'),('COMPANY_OWNER','quality:approve'),('COMPANY_OWNER','safety:read'),('COMPANY_OWNER','safety:manage'),('COMPANY_OWNER','compliance:read'),('COMPANY_OWNER','compliance:manage'),
('COMPANY_ADMIN','quality:read'),('COMPANY_ADMIN','quality:manage'),('COMPANY_ADMIN','quality:approve'),('COMPANY_ADMIN','safety:read'),('COMPANY_ADMIN','safety:manage'),('COMPANY_ADMIN','compliance:read'),('COMPANY_ADMIN','compliance:manage'),
('DIRECTOR','quality:read'),('DIRECTOR','quality:manage'),('DIRECTOR','quality:approve'),('DIRECTOR','safety:read'),('DIRECTOR','safety:manage'),('DIRECTOR','compliance:read'),('DIRECTOR','compliance:manage'),
('PROJECT_MANAGER','quality:read'),('PROJECT_MANAGER','quality:manage'),('PROJECT_MANAGER','quality:approve'),('PROJECT_MANAGER','safety:read'),('PROJECT_MANAGER','safety:manage'),('PROJECT_MANAGER','compliance:read'),('PROJECT_MANAGER','compliance:manage'),
('SITE_ENGINEER','quality:read'),('SITE_ENGINEER','quality:manage'),('SITE_ENGINEER','safety:read'),('SITE_ENGINEER','safety:manage'),('SITE_ENGINEER','compliance:read'),('SITE_SUPERVISOR','quality:read'),('SITE_SUPERVISOR','quality:manage'),('SITE_SUPERVISOR','safety:read'),('SITE_SUPERVISOR','safety:manage'),('SITE_SUPERVISOR','compliance:read'),('ACCOUNTANT','quality:read'),('ACCOUNTANT','safety:read'),('ACCOUNTANT','compliance:read');

notify pgrst,'reload schema';
commit;
