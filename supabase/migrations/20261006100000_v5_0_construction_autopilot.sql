begin;

insert into public.permissions(key,description) values
('autopilot:read','View Construction Autopilot field intelligence and morning brief'),
('autopilot:manage','Capture field updates and manage Autopilot intelligence events')
on conflict(key) do update set description=excluded.description;

delete from public.role_permissions where permission_key in ('autopilot:read','autopilot:manage');
insert into public.role_permissions(role,permission_key) values
('SUPER_ADMIN','autopilot:read'),('SUPER_ADMIN','autopilot:manage'),
('COMPANY_OWNER','autopilot:read'),('COMPANY_OWNER','autopilot:manage'),
('COMPANY_ADMIN','autopilot:read'),('COMPANY_ADMIN','autopilot:manage'),
('DIRECTOR','autopilot:read'),('DIRECTOR','autopilot:manage'),
('PROJECT_MANAGER','autopilot:read'),('PROJECT_MANAGER','autopilot:manage'),
('SITE_ENGINEER','autopilot:read'),('SITE_ENGINEER','autopilot:manage'),
('SITE_SUPERVISOR','autopilot:read'),('SITE_SUPERVISOR','autopilot:manage'),
('STOREKEEPER','autopilot:read'),('STOREKEEPER','autopilot:manage'),
('ACCOUNTANT','autopilot:read');

create table if not exists public.construction_field_captures (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid null references public.projects(id) on delete set null,
  captured_by uuid not null references auth.users(id),
  channel text not null default 'WEB' check(channel in ('WEB','VOICE','WHATSAPP','MOBILE','API')),
  source_text text not null,
  parsed jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'PROCESSED' check(status in ('RECEIVED','PROCESSED','REVIEWED','DISMISSED')),
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists construction_field_captures_company_idx on public.construction_field_captures(company_id,captured_at desc);
create index if not exists construction_field_captures_project_idx on public.construction_field_captures(company_id,project_id,captured_at desc);
alter table public.construction_field_captures enable row level security;
drop policy if exists construction_field_captures_member_all on public.construction_field_captures;
create policy construction_field_captures_member_all on public.construction_field_captures for all using(public.is_company_member(company_id)) with check(public.is_company_member(company_id));

alter table public.construction_intelligence_events add column if not exists metadata jsonb not null default '{}'::jsonb;
create index if not exists construction_intelligence_events_severity_idx on public.construction_intelligence_events(company_id,status,severity,created_at desc);

notify pgrst,'reload schema';
commit;
