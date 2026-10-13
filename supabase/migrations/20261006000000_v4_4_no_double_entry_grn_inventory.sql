-- V4.4: No Double Entry — post GRN and material inventory atomically.
-- Additive: existing inventory and procurement APIs remain available.
create or replace function public.post_goods_received_note_atomic(
  p_company_id uuid,
  p_user_id uuid,
  p_purchase_order_id uuid,
  p_grn_no text,
  p_received_date date,
  p_notes text,
  p_items jsonb
) returns public.goods_received_notes
language plpgsql security definer set search_path=public as $$
declare
  v_po public.purchase_orders;
  v_grn public.goods_received_notes;
  v_item jsonb;
  v_po_item public.purchase_order_items;
  v_qty numeric;
  v_rejected numeric;
  v_next numeric;
  v_grn_item_id uuid;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'Authenticated user mismatch' using errcode='42501';
  end if;
  if not exists(select 1 from company_members where company_id=p_company_id and user_id=auth.uid() and status='ACTIVE') then
    raise exception 'Company access denied' using errcode='42501';
  end if;
  select * into v_po from purchase_orders where company_id=p_company_id and id=p_purchase_order_id for update;
  if not found then raise exception 'Purchase order not found' using errcode='P0002'; end if;
  if v_po.status not in ('APPROVED','SENT','PARTIALLY_RECEIVED') then raise exception 'Purchase order is not receivable' using errcode='22023'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then raise exception 'At least one received item is required' using errcode='22023'; end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_po_item from purchase_order_items where id=(v_item->>'purchaseOrderItemId')::uuid and purchase_order_id=v_po.id for update;
    if not found then raise exception 'One or more received items do not belong to this purchase order' using errcode='22023'; end if;
    v_qty:=coalesce((v_item->>'quantityReceived')::numeric,0);
    v_rejected:=coalesce((v_item->>'quantityRejected')::numeric,0);
    if v_qty <= 0 then raise exception 'Received quantity must be greater than zero' using errcode='22023'; end if;
    if v_rejected < 0 then raise exception 'Rejected quantity cannot be negative' using errcode='22023'; end if;
    if coalesce(v_po_item.received_quantity,0)+v_qty > v_po_item.quantity then raise exception 'Received quantity exceeds ordered quantity' using errcode='22023'; end if;
  end loop;

  insert into goods_received_notes(id,company_id,purchase_order_id,grn_no,received_date,status,received_by,notes)
  values(gen_random_uuid(),p_company_id,v_po.id,p_grn_no,coalesce(p_received_date,current_date),'POSTED',p_user_id,p_notes)
  returning * into v_grn;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty:=coalesce((v_item->>'quantityReceived')::numeric,0);
    v_rejected:=coalesce((v_item->>'quantityRejected')::numeric,0);
    v_grn_item_id:=gen_random_uuid();
    insert into goods_received_note_items(id,grn_id,purchase_order_item_id,quantity_received,quantity_rejected,notes)
    values(v_grn_item_id,v_grn.id,(v_item->>'purchaseOrderItemId')::uuid,v_qty,v_rejected,nullif(v_item->>'notes',''));

    select * into v_po_item from purchase_order_items where id=(v_item->>'purchaseOrderItemId')::uuid for update;
    v_next:=coalesce(v_po_item.received_quantity,0)+v_qty;
    update purchase_order_items set received_quantity=v_next where id=v_po_item.id;

    if v_po_item.material_id is not null then
      perform public.apply_inventory_transaction(
        p_company_id,
        v_po_item.material_id,
        v_po.site_id,
        v_po.project_id,
        'RECEIPT',
        v_qty,
        v_grn.grn_no,
        coalesce(nullif(v_item->>'notes',''),p_notes),
        p_user_id,
        v_grn_item_id
      );
    end if;
  end loop;

  if not exists(select 1 from purchase_order_items where purchase_order_id=v_po.id and received_quantity < quantity) then
    update purchase_orders set status='RECEIVED',updated_at=now() where company_id=p_company_id and id=v_po.id;
  else
    update purchase_orders set status='PARTIALLY_RECEIVED',updated_at=now() where company_id=p_company_id and id=v_po.id;
  end if;
  return v_grn;
end $$;

grant execute on function public.post_goods_received_note_atomic(uuid,uuid,uuid,text,date,text,jsonb) to authenticated;
