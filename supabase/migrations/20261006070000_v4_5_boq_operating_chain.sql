begin;

-- V4.5: BOQ becomes the cross-module operating key. All additions are nullable so
-- existing procurement, expense, subcontract, document and comment records remain valid.
alter table public.purchase_order_items add column if not exists company_id uuid;
alter table public.purchase_order_items add column if not exists estimate_item_id uuid;
update public.purchase_order_items i set company_id=o.company_id from public.purchase_orders o where o.id=i.purchase_order_id and i.company_id is null;
alter table public.purchase_order_items alter column company_id set not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='purchase_order_items_company_fk') then
    alter table public.purchase_order_items add constraint purchase_order_items_company_fk foreign key(company_id) references public.companies(id) on delete cascade;
  end if;
end $$;

create or replace function public.set_v45_purchase_order_item_company() returns trigger language plpgsql as $$
begin
  if new.purchase_order_id is not null then
    select company_id into new.company_id from public.purchase_orders where id=new.purchase_order_id;
  end if;
  return new;
end; $$;
drop trigger if exists set_v45_purchase_order_item_company on public.purchase_order_items;
create trigger set_v45_purchase_order_item_company before insert or update of purchase_order_id on public.purchase_order_items for each row execute function public.set_v45_purchase_order_item_company();
alter table public.expenses add column if not exists estimate_item_id uuid;
alter table public.project_subcontract_items add column if not exists estimate_item_id uuid;
alter table public.documents add column if not exists estimate_item_id uuid;

-- Tenant-safe links.
do $$ begin
  if not exists (select 1 from pg_constraint where conname='purchase_order_item_estimate_tenant_fk') then
    alter table public.purchase_order_items add constraint purchase_order_item_estimate_tenant_fk
      foreign key(company_id,estimate_item_id) references public.project_estimate_items(company_id,id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname='expense_estimate_tenant_fk') then
    alter table public.expenses add constraint expense_estimate_tenant_fk
      foreign key(company_id,estimate_item_id) references public.project_estimate_items(company_id,id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname='subcontract_item_estimate_tenant_fk') then
    alter table public.project_subcontract_items add constraint subcontract_item_estimate_tenant_fk
      foreign key(company_id,estimate_item_id) references public.project_estimate_items(company_id,id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname='document_estimate_tenant_fk') then
    alter table public.documents add constraint document_estimate_tenant_fk
      foreign key(company_id,estimate_item_id) references public.project_estimate_items(company_id,id) on delete set null;
  end if;
end $$;

create index if not exists purchase_order_items_estimate_idx on public.purchase_order_items(estimate_item_id);
create index if not exists expenses_estimate_idx on public.expenses(company_id,project_id,estimate_item_id,expense_date desc);
create index if not exists subcontract_items_estimate_idx on public.project_subcontract_items(estimate_item_id);
create index if not exists documents_estimate_idx on public.documents(company_id,project_id,estimate_item_id,created_at desc);

-- Validate that an estimate item belongs to the same project as its operational record.
create or replace function public.validate_v45_boq_link() returns trigger language plpgsql as $$
declare item_project uuid; record_project uuid;
begin
  if new.estimate_item_id is null then return new; end if;
  select e.project_id into item_project
    from public.project_estimate_items i
    join public.project_estimates e on e.company_id=i.company_id and e.id=i.estimate_id
    where i.company_id=new.company_id and i.id=new.estimate_item_id;
  if item_project is null then raise exception 'BOQ item does not belong to company' using errcode='23514'; end if;
  if tg_table_name='purchase_order_items' then
    select project_id into record_project from public.purchase_orders where company_id=new.company_id and id=new.purchase_order_id;
  elsif tg_table_name='expenses' then
    record_project:=new.project_id;
  elsif tg_table_name='project_subcontract_items' then
    select project_id into record_project from public.project_subcontracts where company_id=new.company_id and id=new.subcontract_id;
  elsif tg_table_name='documents' then
    record_project:=new.project_id;
  end if;
  if record_project is not null and item_project<>record_project then
    raise exception 'BOQ item does not belong to the same project' using errcode='23514';
  end if;
  return new;
end; $$;

drop trigger if exists validate_v45_purchase_order_item_boq on public.purchase_order_items;
create trigger validate_v45_purchase_order_item_boq before insert or update of company_id,estimate_item_id,purchase_order_id on public.purchase_order_items for each row execute function public.validate_v45_boq_link();
drop trigger if exists validate_v45_expense_boq on public.expenses;
create trigger validate_v45_expense_boq before insert or update of company_id,estimate_item_id,project_id on public.expenses for each row execute function public.validate_v45_boq_link();
drop trigger if exists validate_v45_subcontract_item_boq on public.project_subcontract_items;
create trigger validate_v45_subcontract_item_boq before insert or update of company_id,estimate_item_id,subcontract_id on public.project_subcontract_items for each row execute function public.validate_v45_boq_link();
drop trigger if exists validate_v45_document_boq on public.documents;
create trigger validate_v45_document_boq before insert or update of company_id,estimate_item_id,project_id on public.documents for each row execute function public.validate_v45_boq_link();

-- BOQ item is now a first-class comment target, while retaining all existing targets.
alter table public.collaboration_comments drop constraint if exists collaboration_comments_entity_type_check;
alter table public.collaboration_comments add constraint collaboration_comments_entity_type_check check(entity_type in (
 'RFI','SUBMITTAL','DRAWING','TRANSMITTAL','SITE_INSTRUCTION','TASK','ISSUE','PURCHASE_ORDER','NCR','SAFETY_INCIDENT','DAILY_REPORT','CHANGE_ORDER','WORKFRONT','PRODUCTION','BOQ_ITEM'
));

notify pgrst, 'reload schema';
commit;
