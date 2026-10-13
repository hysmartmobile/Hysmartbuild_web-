-- HySmart Build V1.9 Production hardening
-- Unified derived project cost ledger + idempotency protections.
begin;

create unique index if not exists project_retention_one_withheld_per_ipc
  on public.project_retention_transactions(company_id, ipc_id, transaction_type)
  where ipc_id is not null and transaction_type = 'WITHHELD';

create unique index if not exists project_ipc_invoice_unique
  on public.project_client_ipcs(company_id, invoice_id)
  where invoice_id is not null;

create index if not exists purchase_orders_project_status_idx
  on public.purchase_orders(company_id, project_id, status);
create index if not exists supplier_invoices_po_status_idx
  on public.supplier_invoices(company_id, purchase_order_id, status);
create index if not exists expenses_project_status_idx
  on public.expenses(company_id, project_id, status);

-- A single derived source of truth for project commercial cost reporting.
-- It intentionally derives from transactional tables so legacy records are included.
create or replace view public.project_cost_ledger_v as
select
  po.company_id,
  po.project_id,
  po.id as source_id,
  'PURCHASE_ORDER'::text as source_type,
  'COMMITMENT'::text as entry_type,
  coalesce(po.total,0)::numeric as amount,
  po.currency,
  po.order_date as entry_date
from public.purchase_orders po
where po.project_id is not null and po.status <> 'CANCELLED'
union all
select
  si.company_id,
  po.project_id,
  si.id,
  'SUPPLIER_INVOICE',
  'ACTUAL',
  coalesce(si.total,0)::numeric,
  si.currency,
  si.invoice_date
from public.supplier_invoices si
join public.purchase_orders po on po.company_id = si.company_id and po.id = si.purchase_order_id
where po.project_id is not null and si.status in ('APPROVED','PARTIALLY_PAID','PAID')
union all
select
  e.company_id,
  e.project_id,
  e.id,
  'EXPENSE',
  'ACTUAL',
  coalesce(e.amount,0)::numeric,
  e.currency,
  e.expense_date
from public.expenses e
where e.project_id is not null and e.status in ('APPROVED','PAID')
union all
select
  sc.company_id,
  sc.project_id,
  sc.id,
  'SUBCONTRACT',
  'COMMITMENT',
  coalesce(sc.contract_value,0)::numeric,
  sc.currency,
  coalesce(sc.start_date,current_date)
from public.project_subcontracts sc
where sc.status not in ('CANCELLED')
union all
select
  sv.company_id,
  sc.project_id,
  sv.id,
  'SUBCONTRACT_VALUATION',
  'ACTUAL',
  coalesce(sv.net_amount,0)::numeric,
  sc.currency,
  sv.valuation_date
from public.project_subcontract_valuations sv
join public.project_subcontracts sc on sc.company_id = sv.company_id and sc.id = sv.subcontract_id
where sv.status in ('APPROVED','PAID');


notify pgrst, 'reload schema';
commit;
