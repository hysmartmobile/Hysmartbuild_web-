-- V0.7: materials catalog, inventory balances, immutable stock movements, and material requests.
create table public.materials (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  sku text,
  category text,
  unit text not null,
  reorder_level numeric(18,3) not null default 0 check (reorder_level >= 0),
  active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, name)
);
create table public.inventory_balances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  material_id uuid not null references public.materials(id) on delete cascade,
  site_id uuid references public.sites(id) on delete set null,
  quantity numeric(18,3) not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  unique(company_id, material_id, site_id)
);
create table public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  material_id uuid not null references public.materials(id) on delete restrict,
  site_id uuid references public.sites(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  transaction_type text not null check (transaction_type in ('RECEIPT','ISSUE','ADJUSTMENT')),
  quantity numeric(18,3) not null check (quantity > 0),
  balance_after numeric(18,3) not null check (balance_after >= 0),
  reference text,
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create table public.material_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  site_id uuid references public.sites(id) on delete set null,
  requested_by uuid not null references auth.users(id),
  status text not null default 'PENDING' check (status in ('PENDING','APPROVED','REJECTED','PARTIALLY_ISSUED','ISSUED','CANCELLED')),
  notes text,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.material_request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.material_requests(id) on delete cascade,
  material_id uuid not null references public.materials(id) on delete restrict,
  requested_quantity numeric(18,3) not null check (requested_quantity > 0),
  issued_quantity numeric(18,3) not null default 0 check (issued_quantity >= 0 and issued_quantity <= requested_quantity)
);
create index materials_company_idx on public.materials(company_id,active);
create index inventory_company_material_idx on public.inventory_balances(company_id,material_id);
create index inventory_tx_company_date_idx on public.inventory_transactions(company_id,created_at desc);
create index material_requests_company_status_idx on public.material_requests(company_id,status,created_at desc);
create trigger materials_updated_at before update on public.materials for each row execute procedure public.set_updated_at();
create trigger inventory_balances_updated_at before update on public.inventory_balances for each row execute procedure public.set_updated_at();
create trigger material_requests_updated_at before update on public.material_requests for each row execute procedure public.set_updated_at();

alter table public.materials enable row level security;
alter table public.inventory_balances enable row level security;
alter table public.inventory_transactions enable row level security;
alter table public.material_requests enable row level security;
alter table public.material_request_items enable row level security;
create policy materials_member_all on public.materials for all using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));
create policy inventory_balances_member_select on public.inventory_balances for select using (public.is_company_member(company_id));
create policy inventory_tx_member_select on public.inventory_transactions for select using (public.is_company_member(company_id));
create policy material_requests_member_all on public.material_requests for all using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));
create policy material_request_items_member_select on public.material_request_items for select using (exists (select 1 from public.material_requests r where r.id=request_id and public.is_company_member(r.company_id)));

-- Atomic stock movement. Direct balance mutation is intentionally not exposed to the application.
create or replace function public.apply_inventory_transaction(
  p_company_id uuid, p_material_id uuid, p_site_id uuid, p_project_id uuid,
  p_type text, p_quantity numeric, p_reference text, p_notes text, p_user_id uuid
) returns public.inventory_transactions
language plpgsql security definer set search_path=public as $$
declare v_balance public.inventory_balances; v_after numeric; v_tx public.inventory_transactions;
begin
  if p_quantity is null or p_quantity <= 0 then raise exception 'Quantity must be greater than zero' using errcode='22023'; end if;
  if not exists (select 1 from company_members where company_id=p_company_id and user_id=p_user_id and status='ACTIVE') then raise exception 'Company access denied' using errcode='42501'; end if;
  if not exists (select 1 from materials where id=p_material_id and company_id=p_company_id and active=true) then raise exception 'Material not found' using errcode='P0002'; end if;
  insert into inventory_balances(company_id,material_id,site_id,quantity) values(p_company_id,p_material_id,p_site_id,0)
    on conflict(company_id,material_id,site_id) do nothing;
  select * into v_balance from inventory_balances where company_id=p_company_id and material_id=p_material_id and site_id is not distinct from p_site_id for update;
  if p_type='RECEIPT' or p_type='ADJUSTMENT' then v_after:=v_balance.quantity+p_quantity;
  elsif p_type='ISSUE' then
    v_after:=v_balance.quantity-p_quantity;
    if v_after < 0 then raise exception 'Insufficient stock' using errcode='22003'; end if;
  else raise exception 'Invalid transaction type' using errcode='22023'; end if;
  update inventory_balances set quantity=v_after,updated_at=now() where id=v_balance.id;
  insert into inventory_transactions(company_id,material_id,site_id,project_id,transaction_type,quantity,balance_after,reference,notes,created_by)
  values(p_company_id,p_material_id,p_site_id,p_project_id,p_type,p_quantity,v_after,p_reference,p_notes,p_user_id) returning * into v_tx;
  return v_tx;
end $$;

create or replace function public.approve_material_request(p_request_id uuid,p_company_id uuid,p_user_id uuid,p_approve boolean)
returns public.material_requests language plpgsql security definer set search_path=public as $$
declare v_request public.material_requests;
begin
  if not exists(select 1 from company_members where company_id=p_company_id and user_id=p_user_id and status='ACTIVE') then raise exception 'Company access denied' using errcode='42501'; end if;
  select * into v_request from material_requests where id=p_request_id and company_id=p_company_id for update;
  if not found then raise exception 'Material request not found' using errcode='P0002'; end if;
  if v_request.status <> 'PENDING' then raise exception 'Only pending requests can be approved or rejected' using errcode='22023'; end if;
  update material_requests set status=case when p_approve then 'APPROVED' else 'REJECTED' end,approved_by=p_user_id,approved_at=now(),updated_at=now() where id=p_request_id returning * into v_request;
  return v_request;
end $$;

insert into public.permissions(key,description) values
('material:create','Create material catalog items'),('material:read','Read materials and inventory'),('material:receive','Receive stock'),('material:issue','Issue stock'),('material:request','Create material requests'),('material:approve','Approve or reject material requests')
on conflict(key) do update set description=excluded.description;
delete from public.role_permissions where permission_key in ('material:create','material:read','material:receive','material:issue','material:request','material:approve');
insert into public.role_permissions(role,permission_key) values
('SUPER_ADMIN','material:create'),('SUPER_ADMIN','material:read'),('SUPER_ADMIN','material:receive'),('SUPER_ADMIN','material:issue'),('SUPER_ADMIN','material:request'),('SUPER_ADMIN','material:approve'),
('COMPANY_OWNER','material:create'),('COMPANY_OWNER','material:read'),('COMPANY_OWNER','material:receive'),('COMPANY_OWNER','material:issue'),('COMPANY_OWNER','material:request'),('COMPANY_OWNER','material:approve'),
('COMPANY_ADMIN','material:create'),('COMPANY_ADMIN','material:read'),('COMPANY_ADMIN','material:receive'),('COMPANY_ADMIN','material:issue'),('COMPANY_ADMIN','material:request'),('COMPANY_ADMIN','material:approve'),
('DIRECTOR','material:create'),('DIRECTOR','material:read'),('DIRECTOR','material:receive'),('DIRECTOR','material:issue'),('DIRECTOR','material:request'),('DIRECTOR','material:approve'),
('PROJECT_MANAGER','material:read'),('PROJECT_MANAGER','material:issue'),('PROJECT_MANAGER','material:request'),
('SITE_ENGINEER','material:read'),('SITE_ENGINEER','material:request'),
('SITE_SUPERVISOR','material:read'),('SITE_SUPERVISOR','material:request'),
('STOREKEEPER','material:create'),('STOREKEEPER','material:read'),('STOREKEEPER','material:receive'),('STOREKEEPER','material:issue'),('STOREKEEPER','material:request'),
('WORKER','material:read') on conflict do nothing;

-- Security hardening for SECURITY DEFINER functions: caller identity is never supplied as a trusted value.
create or replace function public.apply_inventory_transaction(
  p_company_id uuid, p_material_id uuid, p_site_id uuid, p_project_id uuid,
  p_type text, p_quantity numeric, p_reference text, p_notes text, p_user_id uuid
) returns public.inventory_transactions
language plpgsql security definer set search_path=public as $$
declare v_balance public.inventory_balances; v_after numeric; v_tx public.inventory_transactions;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then raise exception 'Authenticated user mismatch' using errcode='42501'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Quantity must be greater than zero' using errcode='22023'; end if;
  if not exists (select 1 from company_members where company_id=p_company_id and user_id=auth.uid() and status='ACTIVE') then raise exception 'Company access denied' using errcode='42501'; end if;
  if not exists (select 1 from materials where id=p_material_id and company_id=p_company_id and active=true) then raise exception 'Material not found' using errcode='P0002'; end if;
  insert into inventory_balances(company_id,material_id,site_id,quantity) values(p_company_id,p_material_id,p_site_id,0)
    on conflict(company_id,material_id,site_id) do nothing;
  select * into v_balance from inventory_balances where company_id=p_company_id and material_id=p_material_id and site_id is not distinct from p_site_id for update;
  if p_type='RECEIPT' or p_type='ADJUSTMENT' then v_after:=v_balance.quantity+p_quantity;
  elsif p_type='ISSUE' then v_after:=v_balance.quantity-p_quantity; if v_after < 0 then raise exception 'Insufficient stock' using errcode='22003'; end if;
  else raise exception 'Invalid transaction type' using errcode='22023'; end if;
  update inventory_balances set quantity=v_after,updated_at=now() where id=v_balance.id;
  insert into inventory_transactions(company_id,material_id,site_id,project_id,transaction_type,quantity,balance_after,reference,notes,created_by)
  values(p_company_id,p_material_id,p_site_id,p_project_id,p_type,p_quantity,v_after,p_reference,p_notes,auth.uid()) returning * into v_tx;
  return v_tx;
end $$;

create or replace function public.approve_material_request(p_request_id uuid,p_company_id uuid,p_user_id uuid,p_approve boolean)
returns public.material_requests language plpgsql security definer set search_path=public as $$
declare v_request public.material_requests;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then raise exception 'Authenticated user mismatch' using errcode='42501'; end if;
  if not exists(select 1 from company_members where company_id=p_company_id and user_id=auth.uid() and status='ACTIVE') then raise exception 'Company access denied' using errcode='42501'; end if;
  select * into v_request from material_requests where id=p_request_id and company_id=p_company_id for update;
  if not found then raise exception 'Material request not found' using errcode='P0002'; end if;
  if v_request.status <> 'PENDING' then raise exception 'Only pending requests can be approved or rejected' using errcode='22023'; end if;
  update material_requests set status=case when p_approve then 'APPROVED' else 'REJECTED' end,approved_by=auth.uid(),approved_at=now(),updated_at=now() where id=p_request_id returning * into v_request;
  return v_request;
end $$;

create or replace function public.create_material_request(
  p_company_id uuid,p_project_id uuid,p_site_id uuid,p_notes text,p_user_id uuid,p_items jsonb
) returns public.material_requests
language plpgsql security definer set search_path=public as $$
declare v_request public.material_requests; v_item jsonb;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then raise exception 'Authenticated user mismatch' using errcode='42501'; end if;
  if not exists(select 1 from company_members where company_id=p_company_id and user_id=auth.uid() and status='ACTIVE') then raise exception 'Company access denied' using errcode='42501'; end if;
  if not exists(select 1 from projects where id=p_project_id and company_id=p_company_id) then raise exception 'Project not found' using errcode='P0002'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then raise exception 'At least one material is required' using errcode='22023'; end if;
  insert into material_requests(company_id,project_id,site_id,requested_by,notes) values(p_company_id,p_project_id,p_site_id,auth.uid(),p_notes) returning * into v_request;
  for v_item in select * from jsonb_array_elements(p_items) loop
    if (v_item->>'quantity')::numeric <= 0 then raise exception 'Material quantity must be greater than zero' using errcode='22023'; end if;
    if not exists(select 1 from materials where id=(v_item->>'materialId')::uuid and company_id=p_company_id and active=true) then raise exception 'Material not found' using errcode='P0002'; end if;
    insert into material_request_items(request_id,material_id,requested_quantity) values(v_request.id,(v_item->>'materialId')::uuid,(v_item->>'quantity')::numeric);
  end loop;
  return v_request;
end $$;
revoke all on function public.apply_inventory_transaction(uuid,uuid,uuid,uuid,text,numeric,text,text,uuid) from public,anon,authenticated;
revoke all on function public.approve_material_request(uuid,uuid,uuid,boolean) from public,anon,authenticated;
revoke all on function public.create_material_request(uuid,uuid,uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.apply_inventory_transaction(uuid,uuid,uuid,uuid,text,numeric,text,text,uuid) to authenticated;
grant execute on function public.approve_material_request(uuid,uuid,uuid,boolean) to authenticated;
grant execute on function public.create_material_request(uuid,uuid,uuid,text,uuid,jsonb) to authenticated;
