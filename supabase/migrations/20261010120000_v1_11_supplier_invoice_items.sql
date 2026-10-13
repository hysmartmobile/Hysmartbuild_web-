-- V1.11: item-level supplier invoice allocation for accurate BOQ actual costs.
-- Additive: existing supplier invoice header workflow remains valid.
begin;

create table if not exists public.supplier_invoice_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  supplier_invoice_id uuid not null,
  purchase_order_id uuid not null,
  purchase_order_item_id uuid not null references public.purchase_order_items(id) on delete restrict,
  description text not null,
  quantity numeric(20,4) not null check (quantity > 0),
  unit text not null,
  unit_price numeric(20,4) not null check (unit_price >= 0),
  tax_rate numeric(8,4) not null default 0 check (tax_rate >= 0),
  line_subtotal numeric(20,4) not null check (line_subtotal >= 0),
  tax_amount numeric(20,4) not null default 0 check (tax_amount >= 0),
  total numeric(20,4) not null check (total >= 0),
  created_at timestamptz not null default now(),
  unique(company_id, id),
  foreign key (company_id, supplier_invoice_id)
    references public.supplier_invoices(company_id, id) on delete cascade,
  foreign key (company_id, purchase_order_id)
    references public.purchase_orders(company_id, id) on delete restrict
);

create index if not exists supplier_invoice_items_invoice_idx
  on public.supplier_invoice_items(company_id, supplier_invoice_id);
create index if not exists supplier_invoice_items_po_item_idx
  on public.supplier_invoice_items(company_id, purchase_order_item_id);

alter table public.supplier_invoice_items enable row level security;
drop policy if exists supplier_invoice_items_member_read on public.supplier_invoice_items;
create policy supplier_invoice_items_member_read on public.supplier_invoice_items
  for select to authenticated using (
    exists (select 1 from public.company_members m
      where m.company_id = supplier_invoice_items.company_id
        and m.user_id = auth.uid() and m.status = 'ACTIVE')
  );

-- Enforce that the line's PO item belongs to its declared PO and that the
-- invoice header, PO and line all belong to the same company/PO.
create or replace function public.validate_supplier_invoice_item_links()
returns trigger language plpgsql set search_path = public as $$
declare item_po uuid; invoice_po uuid;
begin
  select purchase_order_id into item_po from public.purchase_order_items
   where id = new.purchase_order_item_id;
  if item_po is null or item_po <> new.purchase_order_id then
    raise exception 'Supplier invoice line purchase-order item does not belong to the declared purchase order';
  end if;
  select purchase_order_id into invoice_po from public.supplier_invoices
   where id = new.supplier_invoice_id and company_id = new.company_id;
  if invoice_po is null or invoice_po <> new.purchase_order_id then
    raise exception 'Supplier invoice line must match the invoice purchase order';
  end if;
  return new;
end; $$;
drop trigger if exists supplier_invoice_item_links_guard on public.supplier_invoice_items;
create trigger supplier_invoice_item_links_guard
before insert or update on public.supplier_invoice_items
for each row execute function public.validate_supplier_invoice_item_links();

notify pgrst, 'reload schema';
commit;
