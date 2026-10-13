-- V1.4 Offline Field Operations & Sync
create table public.offline_sync_operations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  operation_type text not null,
  entity_type text not null,
  entity_id uuid,
  base_updated_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'APPLIED' check(status in ('APPLIED','CONFLICT','FAILED')),
  result jsonb,
  conflict jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(company_id, operation_id)
);
create index offline_sync_company_created_idx on public.offline_sync_operations(company_id, created_at desc);
create index offline_sync_company_status_idx on public.offline_sync_operations(company_id, status, created_at desc);
alter table public.offline_sync_operations enable row level security;
create policy offline_sync_member_select on public.offline_sync_operations for select using(public.is_company_member(company_id) and user_id = auth.uid());
create policy offline_sync_member_insert on public.offline_sync_operations for insert with check(public.is_company_member(company_id) and user_id = auth.uid());

insert into public.permissions(key,description) values
('sync:push','Push offline field operations and reconcile conflicts'),
('sync:read','Read offline synchronization state')
on conflict(key) do update set description=excluded.description;

delete from public.role_permissions where permission_key in ('sync:push','sync:read');
insert into public.role_permissions(role,permission_key) values
('SUPER_ADMIN','sync:push'),('SUPER_ADMIN','sync:read'),
('COMPANY_OWNER','sync:push'),('COMPANY_OWNER','sync:read'),
('COMPANY_ADMIN','sync:push'),('COMPANY_ADMIN','sync:read'),
('DIRECTOR','sync:push'),('DIRECTOR','sync:read'),
('PROJECT_MANAGER','sync:push'),('PROJECT_MANAGER','sync:read'),
('SITE_ENGINEER','sync:push'),('SITE_ENGINEER','sync:read'),
('SITE_SUPERVISOR','sync:push'),('SITE_SUPERVISOR','sync:read'),
('STOREKEEPER','sync:push'),('STOREKEEPER','sync:read'),
('HR_MANAGER','sync:push'),('HR_MANAGER','sync:read'),
('WORKER','sync:push'),('WORKER','sync:read')
on conflict do nothing;

-- Idempotent transaction/request primitives for offline retries.
alter table public.inventory_transactions add column if not exists operation_id uuid;
create unique index if not exists inventory_transactions_company_operation_uidx on public.inventory_transactions(company_id, operation_id) where operation_id is not null;

create or replace function public.apply_inventory_transaction(
  p_company_id uuid, p_material_id uuid, p_site_id uuid, p_project_id uuid,
  p_type text, p_quantity numeric, p_reference text, p_notes text, p_user_id uuid, p_operation_id uuid default null
) returns public.inventory_transactions
language plpgsql security definer set search_path=public as $$
declare v_balance public.inventory_balances; v_after numeric; v_tx public.inventory_transactions;
begin
  if p_operation_id is not null then
    select * into v_tx from inventory_transactions where company_id=p_company_id and operation_id=p_operation_id limit 1;
    if found then return v_tx; end if;
  end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Quantity must be greater than zero' using errcode='22023'; end if;
  if auth.uid() is null or auth.uid() <> p_user_id then raise exception 'Authenticated user mismatch' using errcode='42501'; end if;
  if not exists (select 1 from company_members where company_id=p_company_id and user_id=auth.uid() and status='ACTIVE') then raise exception 'Company access denied' using errcode='42501'; end if;
  if not exists (select 1 from materials where id=p_material_id and company_id=p_company_id and active=true) then raise exception 'Material not found' using errcode='P0002'; end if;
  insert into inventory_balances(company_id,material_id,site_id,quantity) values(p_company_id,p_material_id,p_site_id,0) on conflict(company_id,material_id,site_id) do nothing;
  select * into v_balance from inventory_balances where company_id=p_company_id and material_id=p_material_id and site_id is not distinct from p_site_id for update;
  if p_type in ('RECEIPT','ADJUSTMENT') then v_after:=v_balance.quantity+p_quantity;
  elsif p_type='ISSUE' then v_after:=v_balance.quantity-p_quantity; if v_after < 0 then raise exception 'Insufficient stock' using errcode='22003'; end if;
  else raise exception 'Invalid transaction type' using errcode='22023'; end if;
  update inventory_balances set quantity=v_after,updated_at=now() where id=v_balance.id;
  insert into inventory_transactions(company_id,material_id,site_id,project_id,transaction_type,quantity,balance_after,reference,notes,created_by,operation_id)
  values(p_company_id,p_material_id,p_site_id,p_project_id,p_type,p_quantity,v_after,p_reference,p_notes,auth.uid(),p_operation_id) returning * into v_tx;
  return v_tx;
end $$;

create or replace function public.create_material_request(
  p_company_id uuid,p_project_id uuid,p_site_id uuid,p_notes text,p_user_id uuid,p_items jsonb,p_request_id uuid default null
) returns public.material_requests
language plpgsql security definer set search_path=public as $$
declare v_request public.material_requests; v_item jsonb;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then raise exception 'Authenticated user mismatch' using errcode='42501'; end if;
  if not exists(select 1 from company_members where company_id=p_company_id and user_id=auth.uid() and status='ACTIVE') then raise exception 'Company access denied' using errcode='42501'; end if;
  if p_request_id is not null then select * into v_request from material_requests where id=p_request_id and company_id=p_company_id; if found then return v_request; end if; end if;
  if not exists(select 1 from projects where id=p_project_id and company_id=p_company_id) then raise exception 'Project not found' using errcode='P0002'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then raise exception 'At least one material is required' using errcode='22023'; end if;
  insert into material_requests(id,company_id,project_id,site_id,requested_by,notes) values(coalesce(p_request_id,gen_random_uuid()),p_company_id,p_project_id,p_site_id,auth.uid(),p_notes) returning * into v_request;
  for v_item in select * from jsonb_array_elements(p_items) loop
    if (v_item->>'quantity')::numeric <= 0 then raise exception 'Material quantity must be greater than zero' using errcode='22023'; end if;
    if not exists(select 1 from materials where id=(v_item->>'materialId')::uuid and company_id=p_company_id and active=true) then raise exception 'Material not found' using errcode='P0002'; end if;
    insert into material_request_items(request_id,material_id,requested_quantity) values(v_request.id,(v_item->>'materialId')::uuid,(v_item->>'quantity')::numeric);
  end loop;
  return v_request;
end $$;
