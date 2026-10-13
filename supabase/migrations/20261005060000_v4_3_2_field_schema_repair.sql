-- V4.3.2 production schema repair
-- Idempotently restores the V2.1 field-operation columns/indexes for databases
-- where the original V2.1 migration was skipped or only partially applied.

alter table public.attendance_records
  add column if not exists location_latitude numeric(10,7),
  add column if not exists location_longitude numeric(10,7),
  add column if not exists location_accuracy_m numeric(8,2),
  add column if not exists location_verified boolean not null default false;

alter table public.daily_site_reports
  add column if not exists location_latitude numeric(10,7),
  add column if not exists location_longitude numeric(10,7),
  add column if not exists location_accuracy_m numeric(8,2),
  add column if not exists location_verified boolean not null default false;

create index if not exists attendance_field_lookup_idx
  on public.attendance_records(company_id,site_id,attendance_date,worker_id);

create index if not exists daily_reports_field_lookup_idx
  on public.daily_site_reports(company_id,project_id,site_id,report_date);

create unique index if not exists offline_sync_operations_company_operation_uidx
  on public.offline_sync_operations(company_id,operation_id);
