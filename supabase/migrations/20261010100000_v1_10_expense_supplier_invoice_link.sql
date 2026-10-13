-- V1.10: make the relationship between a manually recorded expense and its
-- supplier invoice explicit so BOQ cost forecasts can avoid double counting.
-- Additive migration: existing expenses remain valid and unlinked by default.
begin;

alter table public.expenses
  add column if not exists supplier_invoice_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'expenses_supplier_invoice_tenant_fk'
      and conrelid = 'public.expenses'::regclass
  ) then
    alter table public.expenses
      add constraint expenses_supplier_invoice_tenant_fk
      foreign key (company_id, supplier_invoice_id)
      references public.supplier_invoices(company_id, id)
      on delete restrict;
  end if;
end $$;

create index if not exists expenses_supplier_invoice_idx
  on public.expenses(company_id, supplier_invoice_id)
  where supplier_invoice_id is not null;

commit;
