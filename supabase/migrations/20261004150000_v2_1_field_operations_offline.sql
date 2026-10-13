-- V2.1 Field Operations: geolocation evidence, offline idempotency and field indexes.

alter table public.attendance_records add column if not exists location_latitude numeric(10,7);
alter table public.attendance_records add column if not exists location_longitude numeric(10,7);
alter table public.attendance_records add column if not exists location_accuracy_m numeric(8,2);
alter table public.attendance_records add column if not exists location_verified boolean not null default false;

alter table public.daily_site_reports add column if not exists location_latitude numeric(10,7);
alter table public.daily_site_reports add column if not exists location_longitude numeric(10,7);
alter table public.daily_site_reports add column if not exists location_accuracy_m numeric(8,2);
alter table public.daily_site_reports add column if not exists location_verified boolean not null default false;

create index if not exists attendance_field_lookup_idx on public.attendance_records(company_id,site_id,attendance_date,worker_id);
create index if not exists daily_reports_field_lookup_idx on public.daily_site_reports(company_id,project_id,site_id,report_date);

-- A single device operation must be replayable without creating a second record.
create unique index if not exists offline_sync_operations_company_operation_uidx on public.offline_sync_operations(company_id,operation_id);
