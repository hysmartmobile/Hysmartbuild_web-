-- HySmart Build V1.8 Integrated Construction ERP
-- Estimate -> BOQ -> Budget -> Procurement -> Progress -> Variation -> IPC -> Billing -> Retention -> Profitability -> Closeout
begin;
create extension if not exists pgcrypto;

create table if not exists public.project_estimates (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  estimate_no text not null, version_no integer not null default 1,
  status text not null default 'DRAFT' check(status in ('DRAFT','SUBMITTED','APPROVED','REJECTED','SUPERSEDED')),
  currency text not null, markup_percent numeric(10,4) not null default 0 check(markup_percent>=0),
  subtotal numeric(20,4) not null default 0, markup_amount numeric(20,4) not null default 0, tax_amount numeric(20,4) not null default 0, total_amount numeric(20,4) not null default 0,
  notes text, created_by uuid not null references auth.users(id), approved_by uuid references auth.users(id), approved_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(company_id,id), unique(company_id,estimate_no,version_no)
);
create table if not exists public.project_estimate_items (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  estimate_id uuid not null references public.project_estimates(id) on delete cascade,
  item_no text not null, section text, description text not null, category text not null default 'OTHER' check(category in ('MATERIAL','LABOUR','EQUIPMENT','SUBCONTRACTOR','OTHER')),
  quantity numeric(20,4) not null default 0 check(quantity>=0), unit text not null, unit_rate numeric(20,4) not null default 0 check(unit_rate>=0), tax_rate numeric(8,4) not null default 0 check(tax_rate>=0), line_total numeric(20,4) not null default 0,
  created_at timestamptz not null default now(), unique(company_id,estimate_id,item_no)
);

create table if not exists public.project_budget_baselines (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade, estimate_id uuid references public.project_estimates(id) on delete set null,
  baseline_no text not null, status text not null default 'DRAFT' check(status in ('DRAFT','APPROVED','SUPERSEDED')),
  currency text not null, total_budget numeric(20,4) not null default 0, approved_at timestamptz, approved_by uuid references auth.users(id), notes text,
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(company_id,id), unique(company_id,baseline_no)
);
create table if not exists public.project_budget_baseline_items (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  baseline_id uuid not null references public.project_budget_baselines(id) on delete cascade, estimate_item_id uuid references public.project_estimate_items(id) on delete set null,
  category text not null, description text not null, quantity numeric(20,4) not null default 0, unit text not null, budget_rate numeric(20,4) not null default 0, budget_amount numeric(20,4) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.project_progress_measurements (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade, estimate_item_id uuid references public.project_estimate_items(id) on delete set null,
  measurement_date date not null default current_date, quantity_completed numeric(20,4) not null default 0 check(quantity_completed>=0), percent_complete numeric(8,4) not null default 0 check(percent_complete between 0 and 100), measured_value numeric(20,4) not null default 0,
  location text, notes text, measured_by uuid not null references auth.users(id), status text not null default 'DRAFT' check(status in ('DRAFT','SUBMITTED','APPROVED','REJECTED')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.project_work_certificates (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade, certificate_no text not null, period_start date, period_end date, status text not null default 'DRAFT' check(status in ('DRAFT','SUBMITTED','APPROVED','REJECTED')),
  gross_work_value numeric(20,4) not null default 0, previous_certified numeric(20,4) not null default 0, current_certified numeric(20,4) not null default 0, notes text,
  created_by uuid not null references auth.users(id), approved_by uuid references auth.users(id), approved_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(company_id,certificate_no)
);

create table if not exists public.project_client_ipcs (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade, certificate_id uuid references public.project_work_certificates(id) on delete set null,
  ipc_no text not null, period_start date, period_end date, status text not null default 'DRAFT' check(status in ('DRAFT','SUBMITTED','APPROVED','REJECTED','INVOICED','PAID')),
  gross_work_value numeric(20,4) not null default 0, approved_variations numeric(20,4) not null default 0, gross_valuation numeric(20,4) not null default 0,
  previous_certified numeric(20,4) not null default 0, current_gross numeric(20,4) not null default 0, retention_percent numeric(8,4) not null default 0, retention_amount numeric(20,4) not null default 0,
  advance_recovery numeric(20,4) not null default 0, deductions numeric(20,4) not null default 0, tax_amount numeric(20,4) not null default 0, net_amount numeric(20,4) not null default 0,
  currency text not null, notes text, created_by uuid not null references auth.users(id), approved_by uuid references auth.users(id), approved_at timestamptz, invoice_id uuid references public.accounts_receivable_invoices(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(company_id,ipc_no)
);
create table if not exists public.project_ipc_items (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, ipc_id uuid not null references public.project_client_ipcs(id) on delete cascade,
  estimate_item_id uuid references public.project_estimate_items(id) on delete set null, description text not null, quantity_completed numeric(20,4) not null default 0, unit text, unit_rate numeric(20,4) not null default 0, current_value numeric(20,4) not null default 0
);

create table if not exists public.project_retention_transactions (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, project_id uuid not null references public.projects(id) on delete cascade,
  ipc_id uuid references public.project_client_ipcs(id) on delete set null, transaction_type text not null check(transaction_type in ('WITHHELD','RELEASED','ADJUSTMENT')),
  amount numeric(20,4) not null check(amount>0), transaction_date date not null default current_date, reference text, notes text, created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);

create table if not exists public.project_subcontractors (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, name text not null, email text, phone text, address text, tax_id text, status text not null default 'ACTIVE' check(status in ('ACTIVE','INACTIVE')), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(company_id,name)
);
create table if not exists public.project_subcontracts (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, project_id uuid not null references public.projects(id) on delete cascade, subcontractor_id uuid not null references public.project_subcontractors(id) on delete restrict,
  contract_no text not null, currency text not null, contract_value numeric(20,4) not null default 0, retention_percent numeric(8,4) not null default 0, status text not null default 'DRAFT' check(status in ('DRAFT','ACTIVE','SUSPENDED','COMPLETED','CANCELLED')),
  start_date date, end_date date, notes text, created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(company_id,contract_no)
);
create table if not exists public.project_subcontract_items (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, subcontract_id uuid not null references public.project_subcontracts(id) on delete cascade,
  item_no text not null, description text not null, quantity numeric(20,4) not null default 0, unit text not null, unit_rate numeric(20,4) not null default 0, amount numeric(20,4) not null default 0, created_at timestamptz not null default now()
);
create table if not exists public.project_subcontract_valuations (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, subcontract_id uuid not null references public.project_subcontracts(id) on delete cascade,
  valuation_no text not null, valuation_date date not null default current_date, gross_value numeric(20,4) not null default 0, retention_amount numeric(20,4) not null default 0, deductions numeric(20,4) not null default 0, net_amount numeric(20,4) not null default 0, status text not null default 'DRAFT' check(status in ('DRAFT','SUBMITTED','APPROVED','PAID','REJECTED')), created_by uuid not null references auth.users(id), approved_by uuid references auth.users(id), approved_at timestamptz, created_at timestamptz not null default now(), unique(company_id,valuation_no)
);
create table if not exists public.project_subcontract_payments (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, valuation_id uuid not null references public.project_subcontract_valuations(id) on delete restrict, payment_no text not null, payment_date date not null default current_date, amount numeric(20,4) not null check(amount>0), currency text not null, method text not null, reference text, created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), unique(company_id,payment_no)
);
create table if not exists public.project_subcontract_variations (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, subcontract_id uuid not null references public.project_subcontracts(id) on delete cascade, variation_no text not null, title text not null, amount numeric(20,4) not null default 0, status text not null default 'DRAFT' check(status in ('DRAFT','SUBMITTED','APPROVED','REJECTED','CANCELLED')), reason text, created_by uuid not null references auth.users(id), approved_by uuid references auth.users(id), approved_at timestamptz, created_at timestamptz not null default now(), unique(company_id,variation_no)
);

create table if not exists public.project_quality_inspections (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, project_id uuid not null references public.projects(id) on delete cascade, site_id uuid references public.sites(id) on delete set null,
  inspection_no text not null, title text not null, inspection_date date not null default current_date, inspector_id uuid references auth.users(id), status text not null default 'OPEN' check(status in ('OPEN','PASSED','FAILED','CLOSED')), result text, notes text, created_at timestamptz not null default now(), unique(company_id,inspection_no)
);
create table if not exists public.project_quality_check_items (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, inspection_id uuid not null references public.project_quality_inspections(id) on delete cascade, description text not null, status text not null default 'PENDING' check(status in ('PENDING','PASS','FAIL','NA')), notes text
);
create table if not exists public.project_ncrs (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, project_id uuid not null references public.projects(id) on delete cascade, inspection_id uuid references public.project_quality_inspections(id) on delete set null,
  ncr_no text not null, title text not null, description text, severity text not null default 'MEDIUM' check(severity in ('LOW','MEDIUM','HIGH','CRITICAL')), status text not null default 'OPEN' check(status in ('OPEN','UNDER_CORRECTION','VERIFIED','CLOSED')), corrective_action text, due_date date, owner_id uuid references auth.users(id), verified_by uuid references auth.users(id), verified_at timestamptz, created_at timestamptz not null default now(), unique(company_id,ncr_no)
);
create table if not exists public.project_quality_records (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, project_id uuid not null references public.projects(id) on delete cascade, record_type text not null, title text not null, reference text, document_id uuid references public.documents(id) on delete set null, record_date date not null default current_date, notes text, created_by uuid references auth.users(id), created_at timestamptz not null default now()
);

create table if not exists public.project_safety_incidents (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, project_id uuid not null references public.projects(id) on delete cascade, site_id uuid references public.sites(id) on delete set null,
  incident_no text not null, incident_date date not null default current_date, title text not null, description text, severity text not null default 'MEDIUM' check(severity in ('LOW','MEDIUM','HIGH','CRITICAL')), status text not null default 'OPEN' check(status in ('OPEN','INVESTIGATING','CLOSED')), lost_time boolean not null default false, corrective_action text, owner_id uuid references auth.users(id), created_at timestamptz not null default now(), unique(company_id,incident_no)
);
create table if not exists public.project_toolbox_talks (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, project_id uuid not null references public.projects(id) on delete cascade, talk_date date not null default current_date, topic text not null, conducted_by uuid references auth.users(id), attendee_count integer not null default 0, notes text, created_at timestamptz not null default now()
);
create table if not exists public.project_safety_inspections (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, project_id uuid not null references public.projects(id) on delete cascade, inspection_date date not null default current_date, title text not null, result text, status text not null default 'OPEN' check(status in ('OPEN','PASSED','FAILED','CLOSED')), notes text, inspector_id uuid references auth.users(id), created_at timestamptz not null default now()
);
create table if not exists public.project_permits (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, project_id uuid not null references public.projects(id) on delete cascade, permit_no text not null, permit_type text not null, authority text, issue_date date, expiry_date date, status text not null default 'ACTIVE' check(status in ('PENDING','ACTIVE','EXPIRED','REVOKED')), notes text, created_at timestamptz not null default now(), unique(company_id,permit_no)
);
create table if not exists public.project_safety_actions (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, project_id uuid not null references public.projects(id) on delete cascade, source_type text not null, source_id uuid, title text not null, owner_id uuid references auth.users(id), due_date date, status text not null default 'OPEN' check(status in ('OPEN','IN_PROGRESS','DONE','OVERDUE')), completed_at timestamptz, notes text, created_at timestamptz not null default now()
);

create table if not exists public.project_equipment (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, asset_no text not null, name text not null, category text, serial_no text, ownership text not null default 'OWNED' check(ownership in ('OWNED','LEASED','HIRED')), status text not null default 'AVAILABLE' check(status in ('AVAILABLE','ALLOCATED','MAINTENANCE','RETIRED')), hourly_rate numeric(20,4) not null default 0, daily_rate numeric(20,4) not null default 0, currency text not null default 'NGN', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(company_id,asset_no)
);
create table if not exists public.project_equipment_allocations (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, equipment_id uuid not null references public.project_equipment(id) on delete cascade, project_id uuid not null references public.projects(id) on delete cascade, site_id uuid references public.sites(id) on delete set null, start_date date not null, end_date date, status text not null default 'ACTIVE' check(status in ('ACTIVE','CLOSED')), notes text, created_at timestamptz not null default now()
);
create table if not exists public.project_equipment_logs (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, equipment_id uuid not null references public.project_equipment(id) on delete cascade, project_id uuid references public.projects(id) on delete set null, log_date date not null default current_date, opening_hours numeric(20,4) not null default 0, closing_hours numeric(20,4) not null default 0, hours_used numeric(20,4) not null default 0, fuel_quantity numeric(20,4) not null default 0, fuel_cost numeric(20,4) not null default 0, notes text, created_by uuid references auth.users(id), created_at timestamptz not null default now()
);
create table if not exists public.project_equipment_maintenance (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, equipment_id uuid not null references public.project_equipment(id) on delete cascade, maintenance_date date not null default current_date, maintenance_type text not null, cost numeric(20,4) not null default 0, status text not null default 'OPEN' check(status in ('OPEN','IN_PROGRESS','COMPLETED')), next_due_date date, notes text, created_at timestamptz not null default now()
);

create table if not exists public.project_document_versions (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, project_id uuid not null references public.projects(id) on delete cascade, document_id uuid references public.documents(id) on delete cascade,
  document_no text not null, title text not null, revision text not null, file_path text, status text not null default 'DRAFT' check(status in ('DRAFT','FOR_REVIEW','APPROVED','SUPERSEDED','VOID')), issued_date date, approved_by uuid references auth.users(id), approved_at timestamptz, created_by uuid references auth.users(id), created_at timestamptz not null default now(), unique(company_id,document_no,revision)
);
create table if not exists public.project_transmittals (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, project_id uuid not null references public.projects(id) on delete cascade, transmittal_no text not null, recipient text not null, subject text not null, sent_date date not null default current_date, status text not null default 'DRAFT' check(status in ('DRAFT','SENT','ACKNOWLEDGED')), notes text, created_by uuid references auth.users(id), created_at timestamptz not null default now(), unique(company_id,transmittal_no)
);
create table if not exists public.project_transmittal_items (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, transmittal_id uuid not null references public.project_transmittals(id) on delete cascade, document_version_id uuid not null references public.project_document_versions(id) on delete restrict
);
create table if not exists public.project_rfis (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, project_id uuid not null references public.projects(id) on delete cascade, rfi_no text not null, subject text not null, question text not null, raised_by uuid references auth.users(id), assigned_to uuid references auth.users(id), due_date date, priority text not null default 'NORMAL' check(priority in ('LOW','NORMAL','HIGH','CRITICAL')), status text not null default 'OPEN' check(status in ('OPEN','ASSIGNED','RESPONDED','APPROVED','CLOSED','OVERDUE')), response text, responded_at timestamptz, approved_by uuid references auth.users(id), approved_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(company_id,rfi_no)
);

create table if not exists public.project_closeout_items (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, project_id uuid not null references public.projects(id) on delete cascade, category text not null, title text not null, description text, status text not null default 'OPEN' check(status in ('OPEN','IN_PROGRESS','DONE','WAIVED')), due_date date, owner_id uuid references auth.users(id), completed_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.project_dlp_defects (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, project_id uuid not null references public.projects(id) on delete cascade, defect_no text not null, title text not null, description text, reported_date date not null default current_date, due_date date, status text not null default 'OPEN' check(status in ('OPEN','ASSIGNED','IN_PROGRESS','RECTIFIED','VERIFIED','CLOSED')), assigned_to uuid references auth.users(id), verified_by uuid references auth.users(id), verified_at timestamptz, created_at timestamptz not null default now(), unique(company_id,defect_no)
);

-- Every project-scoped V1.8 record is tenant-bound at the database level.
do $$
declare t text; c text;
begin
 foreach t in array array['project_estimates','project_budget_baselines','project_progress_measurements','project_work_certificates','project_client_ipcs','project_retention_transactions','project_subcontracts','project_quality_inspections','project_ncrs','project_quality_records','project_safety_incidents','project_toolbox_talks','project_safety_inspections','project_permits','project_safety_actions','project_equipment_allocations','project_equipment_logs','project_document_versions','project_transmittals','project_rfis','project_closeout_items','project_dlp_defects'] loop
   c := t || '_project_tenant_fk';
   if not exists (select 1 from pg_constraint where conname=c) then
     execute format('alter table public.%I add constraint %I foreign key(company_id,project_id) references public.projects(company_id,id) on delete cascade',t,c);
   end if;
 end loop;
end $$;

-- Composite uniqueness required by tenant-safe foreign keys below.
do $$ begin
  if not exists (select 1 from pg_constraint where conname='project_work_certificates_company_id_unique_v18') then
    alter table public.project_work_certificates add constraint project_work_certificates_company_id_unique_v18 unique(company_id,id);
  end if;
  if not exists (select 1 from pg_constraint where conname='project_subcontractors_company_id_unique_v18') then
    alter table public.project_subcontractors add constraint project_subcontractors_company_id_unique_v18 unique(company_id,id);
  end if;
  if not exists (select 1 from pg_constraint where conname='project_subcontracts_company_id_unique_v18') then
    alter table public.project_subcontracts add constraint project_subcontracts_company_id_unique_v18 unique(company_id,id);
  end if;
  if not exists (select 1 from pg_constraint where conname='project_subcontract_valuations_company_id_unique_v18') then
    alter table public.project_subcontract_valuations add constraint project_subcontract_valuations_company_id_unique_v18 unique(company_id,id);
  end if;
end $$;

-- Tenant-safe composite references for new cross-entity relationships.
do $$ begin
  if not exists (select 1 from pg_constraint where conname='documents_company_id_unique_v18') then
    alter table public.documents add constraint documents_company_id_unique_v18 unique(company_id,id);
  end if;
  if not exists (select 1 from pg_constraint where conname='project_estimate_items_estimate_tenant_fk') then
    alter table public.project_estimate_items add constraint project_estimate_items_estimate_tenant_fk foreign key(company_id,estimate_id) references public.project_estimates(company_id,id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname='project_budget_baseline_items_baseline_tenant_fk') then
    alter table public.project_budget_baseline_items add constraint project_budget_baseline_items_baseline_tenant_fk foreign key(company_id,baseline_id) references public.project_budget_baselines(company_id,id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname='project_progress_estimate_item_tenant_fk') then
    alter table public.project_progress_measurements add constraint project_progress_estimate_item_tenant_fk foreign key(company_id,estimate_item_id) references public.project_estimate_items(company_id,id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname='project_ipc_certificate_tenant_fk') then
    alter table public.project_client_ipcs add constraint project_ipc_certificate_tenant_fk foreign key(company_id,certificate_id) references public.project_work_certificates(company_id,id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname='project_ipc_items_ipc_tenant_fk') then
    alter table public.project_ipc_items add constraint project_ipc_items_ipc_tenant_fk foreign key(company_id,ipc_id) references public.project_client_ipcs(company_id,id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname='project_retention_ipc_tenant_fk') then
    alter table public.project_retention_transactions add constraint project_retention_ipc_tenant_fk foreign key(company_id,ipc_id) references public.project_client_ipcs(company_id,id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname='project_subcontract_tenant_fk') then
    alter table public.project_subcontracts add constraint project_subcontract_tenant_fk foreign key(company_id,subcontractor_id) references public.project_subcontractors(company_id,id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname='project_subcontract_items_tenant_fk') then
    alter table public.project_subcontract_items add constraint project_subcontract_items_tenant_fk foreign key(company_id,subcontract_id) references public.project_subcontracts(company_id,id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname='project_subcontract_valuation_tenant_fk') then
    alter table public.project_subcontract_valuations add constraint project_subcontract_valuation_tenant_fk foreign key(company_id,subcontract_id) references public.project_subcontracts(company_id,id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname='project_subcontract_payment_tenant_fk') then
    alter table public.project_subcontract_payments add constraint project_subcontract_payment_tenant_fk foreign key(company_id,valuation_id) references public.project_subcontract_valuations(company_id,id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname='project_subcontract_variation_tenant_fk') then
    alter table public.project_subcontract_variations add constraint project_subcontract_variation_tenant_fk foreign key(company_id,subcontract_id) references public.project_subcontracts(company_id,id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname='project_quality_check_tenant_fk') then
    alter table public.project_quality_check_items add constraint project_quality_check_tenant_fk foreign key(company_id,inspection_id) references public.project_quality_inspections(company_id,id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname='project_quality_record_document_tenant_fk') then
    alter table public.project_quality_records add constraint project_quality_record_document_tenant_fk foreign key(company_id,document_id) references public.documents(company_id,id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname='project_equipment_allocation_tenant_fk') then
    alter table public.project_equipment_allocations add constraint project_equipment_allocation_tenant_fk foreign key(company_id,equipment_id) references public.project_equipment(company_id,id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname='project_equipment_log_tenant_fk') then
    alter table public.project_equipment_logs add constraint project_equipment_log_tenant_fk foreign key(company_id,equipment_id) references public.project_equipment(company_id,id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname='project_equipment_maintenance_tenant_fk') then
    alter table public.project_equipment_maintenance add constraint project_equipment_maintenance_tenant_fk foreign key(company_id,equipment_id) references public.project_equipment(company_id,id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname='project_document_version_document_tenant_fk') then
    alter table public.project_document_versions add constraint project_document_version_document_tenant_fk foreign key(company_id,document_id) references public.documents(company_id,id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname='project_transmittal_item_tenant_fk') then
    alter table public.project_transmittal_items add constraint project_transmittal_item_tenant_fk foreign key(company_id,transmittal_id) references public.project_transmittals(company_id,id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname='project_transmittal_document_tenant_fk') then
    alter table public.project_transmittal_items add constraint project_transmittal_document_tenant_fk foreign key(company_id,document_version_id) references public.project_document_versions(company_id,id) on delete restrict;
  end if;
end $$;

create index if not exists project_estimates_project_idx on public.project_estimates(company_id,project_id,status);
create unique index if not exists project_estimates_one_approved on public.project_estimates(company_id,project_id) where status='APPROVED';
create index if not exists project_progress_project_date_idx on public.project_progress_measurements(company_id,project_id,measurement_date desc);
create index if not exists project_ipc_project_status_idx on public.project_client_ipcs(company_id,project_id,status);
create index if not exists project_retention_project_date_idx on public.project_retention_transactions(company_id,project_id,transaction_date desc);
create index if not exists project_rfi_project_status_idx on public.project_rfis(company_id,project_id,status,due_date);
create index if not exists project_closeout_project_status_idx on public.project_closeout_items(company_id,project_id,status);
create index if not exists project_dlp_project_status_idx on public.project_dlp_defects(company_id,project_id,status,due_date);

-- Company-member read policies; all writes remain service-layer controlled.
do $$ declare t text; begin
 foreach t in array array['project_estimates','project_estimate_items','project_budget_baselines','project_budget_baseline_items','project_progress_measurements','project_work_certificates','project_client_ipcs','project_ipc_items','project_retention_transactions','project_subcontractors','project_subcontracts','project_subcontract_items','project_subcontract_valuations','project_subcontract_payments','project_subcontract_variations','project_quality_inspections','project_quality_check_items','project_ncrs','project_quality_records','project_safety_incidents','project_toolbox_talks','project_safety_inspections','project_permits','project_safety_actions','project_equipment','project_equipment_allocations','project_equipment_logs','project_equipment_maintenance','project_document_versions','project_transmittals','project_transmittal_items','project_rfis','project_closeout_items','project_dlp_defects'] loop
   execute format('alter table public.%I enable row level security',t);
   execute format('drop policy if exists %I_member_read on public.%I',t,t);
   if t in ('project_estimate_items','project_budget_baseline_items','project_ipc_items','project_quality_check_items','project_transmittal_items','project_subcontract_items') then
     execute format('create policy %I_member_read on public.%I for select to authenticated using (exists(select 1 from public.company_members m where m.company_id=%I.company_id and m.user_id=auth.uid() and m.status=''ACTIVE''))',t,t,t);
   else
     execute format('create policy %I_member_read on public.%I for select to authenticated using (exists(select 1 from public.company_members m where m.company_id=%I.company_id and m.user_id=auth.uid() and m.status=''ACTIVE''))',t,t,t);
   end if;
 end loop;
end $$;

insert into public.permissions(key,description) values
('construction:read','View integrated construction ERP records'),('construction:manage','Manage estimates, budgets, progress and construction controls'),
('construction:approve','Approve estimates, budgets, IPCs and closeout controls'),('commercial:manage','Manage client valuation, billing, retention and profitability'),
('subcontract:manage','Manage subcontractors, contracts and valuations'),('quality:manage','Manage inspections, NCRs and quality records'),('safety:manage','Manage safety incidents, inspections, permits and actions'),
('equipment:manage','Manage equipment, allocation, fuel and maintenance'),('document_control:manage','Manage revisions, transmittals and controlled documents'),('rfi:manage','Manage RFIs and technical responses'),('closeout:manage','Manage handover, final account and DLP defects')
on conflict(key) do nothing;
insert into public.role_permissions(role,permission_key)
select x.role,x.permission_key from (values
('COMPANY_OWNER','construction:read'),('COMPANY_OWNER','construction:manage'),('COMPANY_OWNER','construction:approve'),('COMPANY_OWNER','commercial:manage'),('COMPANY_OWNER','subcontract:manage'),('COMPANY_OWNER','quality:manage'),('COMPANY_OWNER','safety:manage'),('COMPANY_OWNER','equipment:manage'),('COMPANY_OWNER','document_control:manage'),('COMPANY_OWNER','rfi:manage'),('COMPANY_OWNER','closeout:manage'),
('COMPANY_ADMIN','construction:read'),('COMPANY_ADMIN','construction:manage'),('COMPANY_ADMIN','construction:approve'),('COMPANY_ADMIN','commercial:manage'),('COMPANY_ADMIN','subcontract:manage'),('COMPANY_ADMIN','quality:manage'),('COMPANY_ADMIN','safety:manage'),('COMPANY_ADMIN','equipment:manage'),('COMPANY_ADMIN','document_control:manage'),('COMPANY_ADMIN','rfi:manage'),('COMPANY_ADMIN','closeout:manage'),
('DIRECTOR','construction:read'),('DIRECTOR','construction:manage'),('DIRECTOR','construction:approve'),('DIRECTOR','commercial:manage'),('DIRECTOR','subcontract:manage'),('DIRECTOR','quality:manage'),('DIRECTOR','safety:manage'),('DIRECTOR','equipment:manage'),('DIRECTOR','document_control:manage'),('DIRECTOR','rfi:manage'),('DIRECTOR','closeout:manage'),
('PROJECT_MANAGER','construction:read'),('PROJECT_MANAGER','construction:manage'),('PROJECT_MANAGER','construction:approve'),('PROJECT_MANAGER','commercial:manage'),('PROJECT_MANAGER','subcontract:manage'),('PROJECT_MANAGER','quality:manage'),('PROJECT_MANAGER','safety:manage'),('PROJECT_MANAGER','equipment:manage'),('PROJECT_MANAGER','document_control:manage'),('PROJECT_MANAGER','rfi:manage'),('PROJECT_MANAGER','closeout:manage'),
('SITE_ENGINEER','construction:read'),('SITE_ENGINEER','construction:manage'),('SITE_ENGINEER','quality:manage'),('SITE_ENGINEER','safety:manage'),('SITE_ENGINEER','rfi:manage'),
('SITE_SUPERVISOR','construction:read'),('SITE_SUPERVISOR','construction:manage'),('SITE_SUPERVISOR','quality:manage'),('SITE_SUPERVISOR','safety:manage'),
('ACCOUNTANT','construction:read'),('ACCOUNTANT','commercial:manage'),('ACCOUNTANT','construction:approve'),('ACCOUNTANT','subcontract:manage'),
('STOREKEEPER','construction:read'),('STOREKEEPER','equipment:manage'),
('HR_MANAGER','construction:read'),('HR_MANAGER','safety:manage')
) x(role,permission_key) where exists(select 1 from public.permissions p where p.key=x.permission_key) on conflict do nothing;

create or replace function public.touch_v1_8_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end; $$;
do $$ declare t text; begin foreach t in array array['project_estimates','project_budget_baselines','project_progress_measurements','project_work_certificates','project_client_ipcs','project_subcontractors','project_subcontracts','project_rfis'] loop execute format('drop trigger if exists %I on public.%I','touch_'||t,t); execute format('create trigger %I before update on public.%I for each row execute function public.touch_v1_8_updated_at()','touch_'||t,t); end loop; end $$;

notify pgrst,'reload schema';
commit;
