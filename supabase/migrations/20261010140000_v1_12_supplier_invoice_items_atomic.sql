-- V1.12: serialize supplier invoice line batches and insert each batch atomically.
-- The invoice row lock makes concurrent requests for the same invoice deterministic.
begin;

create or replace function public.add_supplier_invoice_items_atomic(
  p_company_id uuid,
  p_invoice_id uuid,
  p_items jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.supplier_invoices%rowtype;
  v_po public.purchase_orders%rowtype;
  v_line jsonb;
  v_item public.purchase_order_items%rowtype;
  v_id uuid;
  v_qty numeric(20,4);
  v_unit_price numeric(20,4);
  v_tax_rate numeric(8,4);
  v_subtotal numeric(20,4);
  v_tax numeric(20,4);
  v_total numeric(20,4);
  v_subtotal_sum numeric(20,4) := 0;
  v_tax_sum numeric(20,4) := 0;
  v_total_sum numeric(20,4) := 0;
  v_count integer := 0;
  v_result jsonb := '[]'::jsonb;
  v_inserted jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one supplier invoice line is required';
  end if;

  -- Serialize all line submissions for this invoice. The second concurrent
  -- transaction rechecks existing lines after it acquires this row lock.
  select * into v_invoice
    from public.supplier_invoices
   where company_id = p_company_id and id = p_invoice_id
   for update;
  if not found then raise exception 'Supplier invoice not found for this company'; end if;
  if v_invoice.purchase_order_id is null then
    raise exception 'Invoice must be linked to a purchase order before adding BOQ invoice lines';
  end if;
  if upper(coalesce(v_invoice.status, '')) not in ('RECEIVED','DRAFT') then
    raise exception 'Invoice lines can only be added before approval';
  end if;
  if exists (select 1 from public.supplier_invoice_items where company_id=p_company_id and supplier_invoice_id=p_invoice_id) then
    raise exception 'Invoice lines already exist; duplicate submissions are blocked';
  end if;

  select * into v_po from public.purchase_orders
   where company_id=p_company_id and id=v_invoice.purchase_order_id;
  if not found then raise exception 'Purchase order not found for this company'; end if;
  if v_po.supplier_id <> v_invoice.supplier_id then raise exception 'Invoice supplier does not match purchase order supplier'; end if;
  if upper(v_po.currency) <> upper(v_invoice.currency) then raise exception 'Invoice currency does not match purchase order currency'; end if;

  for v_line in select value from jsonb_array_elements(p_items)
  loop
    v_count := v_count + 1;
    v_id := nullif(v_line->>'id','')::uuid;
    v_qty := (v_line->>'quantity')::numeric;
    v_unit_price := (v_line->>'unit_price')::numeric;
    v_tax_rate := coalesce(nullif(v_line->>'tax_rate','')::numeric,0);
    if v_qty <= 0 or v_unit_price < 0 or v_tax_rate < 0 then
      raise exception 'Invoice line quantity, price or tax rate is invalid';
    end if;

    select * into v_item from public.purchase_order_items
     where id=(v_line->>'purchase_order_item_id')::uuid
       and purchase_order_id=v_invoice.purchase_order_id;
    if not found then raise exception 'Every invoice line must reference an item on the invoice purchase order'; end if;

    v_subtotal := round(v_qty * v_unit_price, 4);
    v_tax := round(v_subtotal * v_tax_rate / 100, 4);
    v_total := round(v_subtotal + v_tax, 4);
    if abs(v_subtotal - (v_line->>'line_subtotal')::numeric) > 0.0001
       or abs(v_tax - (v_line->>'tax_amount')::numeric) > 0.0001
       or abs(v_total - (v_line->>'total')::numeric) > 0.0001 then
      raise exception 'Invoice line values failed server-side calculation validation';
    end if;

    insert into public.supplier_invoice_items (
      id, company_id, supplier_invoice_id, purchase_order_id,
      purchase_order_item_id, description, quantity, unit, unit_price,
      tax_rate, line_subtotal, tax_amount, total
    ) values (
      coalesce(v_id, gen_random_uuid()), p_company_id, p_invoice_id,
      v_invoice.purchase_order_id, v_item.id,
      coalesce(nullif(v_line->>'description',''), v_item.description),
      v_qty, coalesce(nullif(v_line->>'unit',''), v_item.unit), v_unit_price,
      v_tax_rate, v_subtotal, v_tax, v_total
    ) returning to_jsonb(supplier_invoice_items) into v_inserted;

    v_subtotal_sum := v_subtotal_sum + v_subtotal;
    v_tax_sum := v_tax_sum + v_tax;
    v_total_sum := v_total_sum + v_total;
    v_result := v_result || jsonb_build_array(v_inserted);
  end loop;

  if abs(v_subtotal_sum - coalesce(v_invoice.subtotal,0)) > 0.02
     or abs(v_tax_sum - coalesce(v_invoice.tax,0)) > 0.02
     or abs(v_total_sum - coalesce(v_invoice.total,0)) > 0.02 then
    raise exception 'Invoice line totals must reconcile to the invoice header before saving';
  end if;

  return v_result;
end;
$$;

revoke all on function public.add_supplier_invoice_items_atomic(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.add_supplier_invoice_items_atomic(uuid, uuid, jsonb) to service_role;

notify pgrst, 'reload schema';
commit;
