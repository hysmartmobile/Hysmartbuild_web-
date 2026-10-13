-- V0.6: daily site reports, photo metadata, progress snapshots and storage.

alter table public.project_activity drop constraint if exists project_activity_entity_type_check;
alter table public.project_activity add constraint project_activity_entity_type_check check (entity_type in ('PROJECT','TASK','ISSUE','MILESTONE','SITE','TEAM','SITE_REPORT'));
create table public.daily_site_reports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  site_id uuid references public.sites(id) on delete set null,
  report_date date not null,
  weather text,
  workforce_count integer not null default 0 check (workforce_count >= 0),
  work_completed text,
  work_in_progress text,
  materials_received text,
  materials_used text,
  equipment_used text,
  visitors text,
  issues text,
  safety_observations text,
  delays text,
  additional_notes text,
  overall_progress integer not null default 0 check (overall_progress between 0 and 100),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index daily_report_project_date_site_idx on public.daily_site_reports(company_id,project_id,report_date,coalesce(site_id,'00000000-0000-0000-0000-000000000000'::uuid));
create index daily_report_project_date_idx on public.daily_site_reports(company_id,project_id,report_date desc);
create index daily_report_created_by_idx on public.daily_site_reports(company_id,created_by);
create trigger daily_reports_updated_at before update on public.daily_site_reports for each row execute procedure public.set_updated_at();

create table public.site_report_photos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  report_id uuid not null references public.daily_site_reports(id) on delete cascade,
  file_path text not null unique,
  file_name text not null,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
  file_size integer not null check (file_size > 0 and file_size <= 10485760),
  caption text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index report_photos_report_idx on public.site_report_photos(company_id,project_id,report_id,created_at);

alter table public.daily_site_reports enable row level security;
alter table public.site_report_photos enable row level security;
create policy daily_reports_member_select on public.daily_site_reports for select using (public.is_company_member(company_id));
create policy daily_reports_member_insert on public.daily_site_reports for insert with check (public.is_company_member(company_id) and created_by = auth.uid());
create policy daily_reports_member_update on public.daily_site_reports for update using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));
create policy daily_reports_member_delete on public.daily_site_reports for delete using (public.is_company_member(company_id));
create policy report_photos_member_select on public.site_report_photos for select using (public.is_company_member(company_id));
create policy report_photos_member_insert on public.site_report_photos for insert with check (public.is_company_member(company_id) and created_by = auth.uid());
create policy report_photos_member_delete on public.site_report_photos for delete using (public.is_company_member(company_id));

insert into public.permissions(key,description) values
 ('report:create','Create daily site reports'),('report:read','Read daily site reports'),('report:update','Update daily site reports')
on conflict (key) do nothing;
insert into public.role_permissions(role,permission_key) values
 ('SUPER_ADMIN','report:create'),('SUPER_ADMIN','report:read'),('SUPER_ADMIN','report:update'),
 ('COMPANY_OWNER','report:create'),('COMPANY_OWNER','report:read'),('COMPANY_OWNER','report:update'),
 ('COMPANY_ADMIN','report:create'),('COMPANY_ADMIN','report:read'),('COMPANY_ADMIN','report:update'),
 ('DIRECTOR','report:create'),('DIRECTOR','report:read'),('DIRECTOR','report:update'),
 ('PROJECT_MANAGER','report:create'),('PROJECT_MANAGER','report:read'),('PROJECT_MANAGER','report:update'),
 ('SITE_ENGINEER','report:create'),('SITE_ENGINEER','report:read'),('SITE_ENGINEER','report:update'),
 ('SITE_SUPERVISOR','report:create'),('SITE_SUPERVISOR','report:read'),('SITE_SUPERVISOR','report:update'),
 ('ACCOUNTANT','report:read'),('STOREKEEPER','report:read'),('HR_MANAGER','report:read'),('WORKER','report:read'),('CLIENT','report:read')
on conflict do nothing;

insert into storage.buckets (id,name,public) values ('site-report-photos','site-report-photos',false) on conflict (id) do nothing;
