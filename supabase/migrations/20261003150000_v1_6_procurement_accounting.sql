-- HySmart Build V1.6: Full Procurement + Accounting
begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Procurement master/workflows
-- ---------------------------------------------------------------------------
create table if not exists public.purchase_requisitions (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  requisition_no text not null, project_id uuid references public.projects(id) on delete set null, site_id uuid references public.sites(id) on delete set null,
  requested_by uuid not null references auth.users(id), supplier_id uuid references public.suppliers(id) on delete set null,
  needed_by date, justification text, currency text not null, status text not null default 'DRAFT' check(status in ('DRAFT','SUBMITTED','APPROVED','REJECTED','CANCELLED')),
  estimated_subtotal numeric(20,4) not null default 0, estimated_tax numeric(20,4) not null default 0, estimated_total numeric(20,4) not null default 0,
  approved_by uuid references auth.users(id), approved_at timestamptz, rejection_reason text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(company_id,requisition_no), unique(company_id,id)
);
create table if not exists public.purchase_requisition_items (
  id uuid primary key default gen_random_uuid(), requisition_id uuid not null references public.purchase_requisitions(id) on delete cascade,
  material_id uuid references public.materials(id) on delete set null, description text not null, quantity numeric(20,4) not null check(quantity>0), unit text not null,
  estimated_unit_price numeric(20,4) not null default 0 check(estimated_unit_price>=0), tax_rate numeric(8,4) not null default 0 check(tax_rate>=0), cost_code_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.purchase_quotations (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, requisition_id uuid not null references public.purchase_requisitions(id) on delete restrict,
  supplier_id uuid not null references public.suppliers(id) on delete restrict, quotation_no text not null, quotation_date date not null, valid_until date,
  currency text not null, status text not null default 'DRAFT' check(status in ('DRAFT','SUBMITTED','ACCEPTED','REJECTED','EXPIRED','CANCELLED')),
  subtotal numeric(20,4) not null default 0, tax numeric(20,4) not null default 0, total numeric(20,4) not null default 0, notes text,
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(company_id,quotation_no), unique(company_id,id)
);
create table if not exists public.purchase_quotation_items (
  id uuid primary key default gen_random_uuid(), quotation_id uuid not null references public.purchase_quotations(id) on delete cascade,
  requisition_item_id uuid references public.purchase_requisition_items(id) on delete set null, description text not null, quantity numeric(20,4) not null check(quantity>0), unit text not null,
  unit_price numeric(20,4) not null check(unit_price>=0), tax_rate numeric(8,4) not null default 0, line_total numeric(20,4) generated always as (quantity*unit_price) stored
);

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, po_no text not null,
  supplier_id uuid not null references public.suppliers(id) on delete restrict, requisition_id uuid references public.purchase_requisitions(id) on delete set null, quotation_id uuid references public.purchase_quotations(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null, site_id uuid references public.sites(id) on delete set null, order_date date not null default current_date, expected_date date,
  currency text not null, status text not null default 'DRAFT' check(status in ('DRAFT','SUBMITTED','APPROVED','SENT','PARTIALLY_RECEIVED','RECEIVED','CANCELLED')),
  subtotal numeric(20,4) not null default 0, tax numeric(20,4) not null default 0, total numeric(20,4) not null default 0, notes text,
  created_by uuid not null references auth.users(id), approved_by uuid references auth.users(id), approved_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(company_id,po_no), unique(company_id,id)
);
create table if not exists public.purchase_order_items (
  id uuid primary key default gen_random_uuid(), purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  material_id uuid references public.materials(id) on delete set null, description text not null, quantity numeric(20,4) not null check(quantity>0), unit text not null,
  unit_price numeric(20,4) not null check(unit_price>=0), tax_rate numeric(8,4) not null default 0, received_quantity numeric(20,4) not null default 0 check(received_quantity>=0), cost_code_id uuid,
  line_total numeric(20,4) generated always as (quantity*unit_price) stored
);

create table if not exists public.goods_received_notes (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, purchase_order_id uuid not null references public.purchase_orders(id) on delete restrict,
  grn_no text not null, received_date date not null default current_date, status text not null default 'DRAFT' check(status in ('DRAFT','POSTED','REJECTED','CANCELLED')),
  received_by uuid not null references auth.users(id), notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(company_id,grn_no), unique(company_id,id)
);
create table if not exists public.goods_received_note_items (
  id uuid primary key default gen_random_uuid(), grn_id uuid not null references public.goods_received_notes(id) on delete cascade, purchase_order_item_id uuid not null references public.purchase_order_items(id) on delete restrict,
  quantity_received numeric(20,4) not null check(quantity_received>0), quantity_rejected numeric(20,4) not null default 0 check(quantity_rejected>=0), notes text
);

create table if not exists public.supplier_invoices (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, supplier_id uuid not null references public.suppliers(id) on delete restrict,
  purchase_order_id uuid references public.purchase_orders(id) on delete set null, grn_id uuid references public.goods_received_notes(id) on delete set null,
  invoice_no text not null, invoice_date date not null, due_date date, currency text not null,
  status text not null default 'RECEIVED' check(status in ('DRAFT','RECEIVED','APPROVED','PARTIALLY_PAID','PAID','VOID')),
  subtotal numeric(20,4) not null default 0, tax numeric(20,4) not null default 0, total numeric(20,4) not null default 0, amount_paid numeric(20,4) not null default 0,
  notes text, created_by uuid not null references auth.users(id), approved_by uuid references auth.users(id), approved_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(company_id,invoice_no), unique(company_id,id)
);
create table if not exists public.supplier_payments (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, supplier_invoice_id uuid not null references public.supplier_invoices(id) on delete restrict,
  payment_no text not null, payment_date date not null default current_date, amount numeric(20,4) not null check(amount>0), currency text not null, method text not null,
  reference text, status text not null default 'POSTED' check(status in ('PENDING','POSTED','VOID')), notes text, created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
  unique(company_id,payment_no)
);

-- ---------------------------------------------------------------------------
-- Accounting foundation
-- ---------------------------------------------------------------------------
create table if not exists public.chart_of_accounts (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  code text not null, name text not null, account_type text not null check(account_type in ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE')),
  parent_id uuid references public.chart_of_accounts(id) on delete restrict, active boolean not null default true, system_account boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(company_id,code), unique(company_id,id)
);
create table if not exists public.cost_codes (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  code text not null, name text not null, category text, active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(company_id,code)
);
do $$ begin
  if not exists (select 1 from pg_constraint where conname='purchase_req_items_cost_code_fk') then
    alter table public.purchase_requisition_items add constraint purchase_req_items_cost_code_fk foreign key(cost_code_id) references public.cost_codes(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname='purchase_order_items_cost_code_fk') then
    alter table public.purchase_order_items add constraint purchase_order_items_cost_code_fk foreign key(cost_code_id) references public.cost_codes(id) on delete set null;
  end if;
end $$;

create table if not exists public.accounting_journals (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  journal_no text not null, journal_date date not null default current_date, reference text, description text not null,
  status text not null default 'DRAFT' check(status in ('DRAFT','POSTED','VOID')), source_type text, source_id uuid,
  created_by uuid not null references auth.users(id), posted_by uuid references auth.users(id), posted_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(company_id,journal_no), unique(company_id,id)
);
create table if not exists public.accounting_journal_lines (
  id uuid primary key default gen_random_uuid(), journal_id uuid not null references public.accounting_journals(id) on delete cascade,
  account_id uuid not null references public.chart_of_accounts(id) on delete restrict, cost_code_id uuid references public.cost_codes(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null, site_id uuid references public.sites(id) on delete set null,
  description text, debit numeric(20,4) not null default 0 check(debit>=0), credit numeric(20,4) not null default 0 check(credit>=0),
  currency text not null, check((debit=0 and credit>0) or (credit=0 and debit>0))
);

create table if not exists public.accounts_receivable_invoices (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, customer_name text not null, customer_email text,
  project_id uuid references public.projects(id) on delete set null, invoice_no text not null, invoice_date date not null, due_date date,
  currency text not null, status text not null default 'DRAFT' check(status in ('DRAFT','ISSUED','PARTIALLY_PAID','PAID','VOID')),
  subtotal numeric(20,4) not null default 0, tax numeric(20,4) not null default 0, total numeric(20,4) not null default 0, amount_paid numeric(20,4) not null default 0,
  notes text, created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(company_id,invoice_no)
);
create table if not exists public.accounts_receivable_payments (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, invoice_id uuid not null references public.accounts_receivable_invoices(id) on delete restrict,
  payment_no text not null, payment_date date not null default current_date, amount numeric(20,4) not null check(amount>0), currency text not null, method text not null, reference text, status text not null default 'POSTED' check(status in ('PENDING','POSTED','VOID')), created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), unique(company_id,payment_no)
);

create table if not exists public.tax_rates (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  code text not null, name text not null, rate numeric(8,4) not null check(rate>=0), country_code text, active boolean not null default true, created_at timestamptz not null default now(), unique(company_id,code)
);
create table if not exists public.payroll_runs (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  run_no text not null, period_start date not null, period_end date not null, pay_date date, status text not null default 'DRAFT' check(status in ('DRAFT','APPROVED','PAID','VOID')),
  gross_amount numeric(20,4) not null default 0, tax_amount numeric(20,4) not null default 0, deductions numeric(20,4) not null default 0, net_amount numeric(20,4) not null default 0,
  notes text, created_by uuid not null references auth.users(id), approved_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(company_id,run_no)
);
create table if not exists public.payroll_items (
  id uuid primary key default gen_random_uuid(), payroll_run_id uuid not null references public.payroll_runs(id) on delete cascade, worker_id uuid references public.workers(id) on delete set null,
  worker_name text not null, gross_amount numeric(20,4) not null default 0, tax_amount numeric(20,4) not null default 0, deductions numeric(20,4) not null default 0, net_amount numeric(20,4) not null default 0, currency text not null
);

create table if not exists public.bank_accounts (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  name text not null, bank_name text, account_number_masked text, currency text not null, opening_balance numeric(20,4) not null default 0, active boolean not null default true, created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), unique(company_id,name)
);
create table if not exists public.bank_transactions (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, bank_account_id uuid not null references public.bank_accounts(id) on delete cascade,
  transaction_date date not null, reference text, description text not null, amount numeric(20,4) not null, transaction_type text not null check(transaction_type in ('CREDIT','DEBIT')),
  reconciled boolean not null default false, reconciled_at timestamptz, source_type text, source_id uuid, created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Seed a useful construction chart of accounts per company when first accessed.
-- ---------------------------------------------------------------------------
create or replace function public.seed_default_chart_of_accounts(p_company_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  insert into public.chart_of_accounts(company_id,code,name,account_type,system_account) values
  (p_company_id,'1000','Cash and Bank','ASSET',true),(p_company_id,'1100','Accounts Receivable','ASSET',true),(p_company_id,'1200','Inventory','ASSET',true),
  (p_company_id,'2000','Accounts Payable','LIABILITY',true),(p_company_id,'2100','Tax Payable','LIABILITY',true),(p_company_id,'2200','Payroll Liabilities','LIABILITY',true),
  (p_company_id,'3000','Owner Equity','EQUITY',true),(p_company_id,'4000','Construction Revenue','REVENUE',true),(p_company_id,'5000','Materials Expense','EXPENSE',true),
  (p_company_id,'5100','Labour Expense','EXPENSE',true),(p_company_id,'5200','Subcontractor Expense','EXPENSE',true),(p_company_id,'5300','Equipment Expense','EXPENSE',true),
  (p_company_id,'5400','Site/Project Expense','EXPENSE',true),(p_company_id,'5500','Tax Expense','EXPENSE',true)
  on conflict(company_id,code) do nothing;
  insert into public.cost_codes(company_id,code,name,category) values
  (p_company_id,'MAT','Materials','DIRECT_COST'),(p_company_id,'LAB','Labour','DIRECT_COST'),(p_company_id,'SUB','Subcontractors','DIRECT_COST'),
  (p_company_id,'EQP','Equipment','DIRECT_COST'),(p_company_id,'OVH','Overhead','INDIRECT_COST') on conflict(company_id,code) do nothing;
end; $$;

-- ---------------------------------------------------------------------------
-- Transactional journal posting: balanced lines only.
-- ---------------------------------------------------------------------------
create or replace function public.post_accounting_journal(p_company_id uuid,p_journal_id uuid,p_user_id uuid)
returns public.accounting_journals language plpgsql security definer set search_path=public as $$
declare j public.accounting_journals; d numeric; c numeric;
begin
  select * into j from public.accounting_journals where id=p_journal_id and company_id=p_company_id for update;
  if j.id is null then raise exception 'Journal not found'; end if;
  if j.status='POSTED' then return j; end if;
  select coalesce(sum(debit),0),coalesce(sum(credit),0) into d,c from public.accounting_journal_lines where journal_id=j.id;
  if d<=0 or round(d,4)<>round(c,4) then raise exception 'Journal is not balanced'; end if;
  update public.accounting_journals set status='POSTED',posted_by=p_user_id,posted_at=now(),updated_at=now() where id=j.id returning * into j;
  return j;
end; $$;

-- ---------------------------------------------------------------------------
-- RLS: all company-scoped accounting/procurement records.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['purchase_requisitions','purchase_quotations','purchase_orders','goods_received_notes','supplier_invoices','supplier_payments','chart_of_accounts','cost_codes','accounting_journals','accounts_receivable_invoices','accounts_receivable_payments','tax_rates','payroll_runs','bank_accounts','bank_transactions'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('drop policy if exists %I_member_all on public.%I',t,t);
    execute format('drop policy if exists %I_member_read on public.%I',t,t);
    execute format('create policy %I_member_read on public.%I for select to authenticated using (exists(select 1 from public.company_members m where m.company_id=%I.company_id and m.user_id=auth.uid() and m.status=''ACTIVE''))',t,t,t);
  end loop;
end $$;
alter table public.purchase_requisition_items enable row level security;
alter table public.purchase_quotation_items enable row level security;
alter table public.purchase_order_items enable row level security;
alter table public.goods_received_note_items enable row level security;
alter table public.payroll_items enable row level security;

-- Child policies through their parent company.
drop policy if exists purchase_requisition_items_member_all on public.purchase_requisition_items;
create policy purchase_requisition_items_member_all on public.purchase_requisition_items for select to authenticated using (exists(select 1 from public.purchase_requisitions r join public.company_members m on m.company_id=r.company_id where r.id=purchase_requisition_items.requisition_id and m.user_id=auth.uid() and m.status='ACTIVE'));
drop policy if exists purchase_quotation_items_member_all on public.purchase_quotation_items;
create policy purchase_quotation_items_member_all on public.purchase_quotation_items for select to authenticated using (exists(select 1 from public.purchase_quotations q join public.company_members m on m.company_id=q.company_id where q.id=purchase_quotation_items.quotation_id and m.user_id=auth.uid() and m.status='ACTIVE'));
drop policy if exists purchase_order_items_member_all on public.purchase_order_items;
create policy purchase_order_items_member_all on public.purchase_order_items for select to authenticated using (exists(select 1 from public.purchase_orders o join public.company_members m on m.company_id=o.company_id where o.id=purchase_order_items.purchase_order_id and m.user_id=auth.uid() and m.status='ACTIVE'));
drop policy if exists goods_received_note_items_member_all on public.goods_received_note_items;
create policy goods_received_note_items_member_all on public.goods_received_note_items for select to authenticated using (exists(select 1 from public.goods_received_notes g join public.company_members m on m.company_id=g.company_id where g.id=goods_received_note_items.grn_id and m.user_id=auth.uid() and m.status='ACTIVE'));
drop policy if exists payroll_items_member_all on public.payroll_items;
create policy payroll_items_member_all on public.payroll_items for select to authenticated using (exists(select 1 from public.payroll_runs p join public.company_members m on m.company_id=p.company_id where p.id=payroll_items.payroll_run_id and m.user_id=auth.uid() and m.status='ACTIVE'));

revoke all on function public.seed_default_chart_of_accounts(uuid) from public, authenticated;
grant execute on function public.seed_default_chart_of_accounts(uuid) to service_role;
revoke all on function public.post_accounting_journal(uuid,uuid,uuid) from public, authenticated;
grant execute on function public.post_accounting_journal(uuid,uuid,uuid) to service_role;

-- Indexes
create index if not exists purchase_req_company_status_idx on public.purchase_requisitions(company_id,status,created_at desc);
create index if not exists quotation_company_status_idx on public.purchase_quotations(company_id,status,created_at desc);
create index if not exists po_company_status_idx on public.purchase_orders(company_id,status,order_date desc);
create index if not exists grn_company_date_idx on public.goods_received_notes(company_id,received_date desc);
create index if not exists supplier_invoice_company_status_idx on public.supplier_invoices(company_id,status,due_date);
create index if not exists journal_company_date_idx on public.accounting_journals(company_id,journal_date desc,status);
create index if not exists journal_line_account_idx on public.accounting_journal_lines(account_id,journal_id);
create index if not exists ar_company_status_idx on public.accounts_receivable_invoices(company_id,status,due_date);
create index if not exists bank_tx_company_date_idx on public.bank_transactions(company_id,transaction_date desc,reconciled);


-- Keep mutable procurement/accounting records timestamped.
create or replace function public.touch_v1_6_updated_at() returns trigger language plpgsql as $$
begin new.updated_at=now(); return new; end; $$;
do $$ declare t text; begin
  foreach t in array array['purchase_requisitions','purchase_quotations','purchase_orders','goods_received_notes','supplier_invoices','chart_of_accounts','cost_codes','accounting_journals','accounts_receivable_invoices','payroll_runs'] loop
    execute format('drop trigger if exists %I on public.%I', 'touch_'||t, t);
    execute format('create trigger %I before update on public.%I for each row execute function public.touch_v1_6_updated_at()', 'touch_'||t, t);
  end loop;
end $$;


-- V1.6 permission catalog and least-privilege role grants.
insert into public.permissions(key,description) values
('procurement:read','View procurement records'),('procurement:create','Create procurement records'),('procurement:approve','Approve procurement records'),('procurement:receive','Receive purchase orders'),('procurement:pay','Record supplier payments'),
('accounting:read','View accounting records and reports'),('accounting:create','Create accounting records'),('accounting:post','Post accounting journals'),('accounting:manage','Manage chart of accounts and cost codes'),
('ar:create','Create accounts receivable invoices'),('ar:read','View accounts receivable'),('ar:pay','Record accounts receivable payments'),('payroll:create','Create payroll runs'),('payroll:approve','Approve and pay payroll'),('bank:read','View bank accounts and transactions'),('bank:manage','Manage bank accounts and reconciliation'),('tax:manage','Manage company tax rates')
on conflict(key) do nothing;
insert into public.role_permissions(role,permission_key)
select x.role,x.permission_key from (values
('COMPANY_OWNER','procurement:read'),('COMPANY_OWNER','procurement:create'),('COMPANY_OWNER','procurement:approve'),('COMPANY_OWNER','procurement:receive'),('COMPANY_OWNER','procurement:pay'),('COMPANY_OWNER','accounting:read'),('COMPANY_OWNER','accounting:create'),('COMPANY_OWNER','accounting:post'),('COMPANY_OWNER','accounting:manage'),('COMPANY_OWNER','ar:create'),('COMPANY_OWNER','ar:read'),('COMPANY_OWNER','ar:pay'),('COMPANY_OWNER','payroll:create'),('COMPANY_OWNER','payroll:approve'),('COMPANY_OWNER','bank:read'),('COMPANY_OWNER','bank:manage'),('COMPANY_OWNER','tax:manage'),
('COMPANY_ADMIN','procurement:read'),('COMPANY_ADMIN','procurement:create'),('COMPANY_ADMIN','procurement:approve'),('COMPANY_ADMIN','procurement:receive'),('COMPANY_ADMIN','accounting:read'),('COMPANY_ADMIN','accounting:create'),('COMPANY_ADMIN','ar:create'),('COMPANY_ADMIN','ar:read'),('COMPANY_ADMIN','bank:read'),
('DIRECTOR','procurement:read'),('DIRECTOR','procurement:create'),('DIRECTOR','procurement:approve'),('DIRECTOR','accounting:read'),('DIRECTOR','ar:read'),
('PROJECT_MANAGER','procurement:read'),('PROJECT_MANAGER','procurement:create'),('PROJECT_MANAGER','accounting:read'),
('SITE_ENGINEER','procurement:read'),('SITE_ENGINEER','procurement:create'),
('SITE_SUPERVISOR','procurement:read'),
('STOREKEEPER','procurement:read'),('STOREKEEPER','procurement:create'),('STOREKEEPER','procurement:receive'),
('ACCOUNTANT','procurement:read'),('ACCOUNTANT','procurement:create'),('ACCOUNTANT','procurement:approve'),('ACCOUNTANT','procurement:pay'),('ACCOUNTANT','accounting:read'),('ACCOUNTANT','accounting:create'),('ACCOUNTANT','accounting:post'),('ACCOUNTANT','accounting:manage'),('ACCOUNTANT','ar:create'),('ACCOUNTANT','ar:read'),('ACCOUNTANT','ar:pay'),('ACCOUNTANT','payroll:create'),('ACCOUNTANT','payroll:approve'),('ACCOUNTANT','bank:read'),('ACCOUNTANT','bank:manage'),('ACCOUNTANT','tax:manage'),
('HR_MANAGER','payroll:create'),('HR_MANAGER','payroll:approve'),('HR_MANAGER','accounting:read'),('HR_MANAGER','bank:read')
) as x(role,permission_key) where exists(select 1 from public.permissions p where p.key=x.permission_key) on conflict do nothing;

commit;
