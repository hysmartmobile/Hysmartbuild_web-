-- RC59 hotfix: repair environments where the BOQ-link migration was not fully applied.
-- The expenses API selects estimate_item_id, so the column must exist even for
-- legacy expense rows. Keep this migration additive and safe to rerun.
begin;

alter table public.expenses
  add column if not exists estimate_item_id uuid;

-- A globally unique primary key on id does not automatically satisfy
-- PostgreSQL's requirement for a composite (company_id, id) foreign key.
-- Add the matching unique key when absent; any unexpected duplicate data makes
-- this fail safely instead of weakening tenant isolation.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.project_estimate_items'::regclass
      and contype in ('p', 'u')
      and regexp_replace(pg_get_constraintdef(oid), '[[:space:]]+', '', 'g')
          in ('UNIQUE(company_id,id)', 'PRIMARYKEY(company_id,id)')
  ) then
    alter table public.project_estimate_items
      add constraint project_estimate_items_company_id_id_uq unique (company_id, id);
  end if;
end $$;

-- Restore the tenant-safe BOQ relationship only after its referenced composite
-- key exists. Do not fall back to a single-column FK or remove the safety check.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'expense_estimate_tenant_fk'
      and conrelid = 'public.expenses'::regclass
  ) then
    alter table public.expenses
      add constraint expense_estimate_tenant_fk
      foreign key (company_id, estimate_item_id)
      references public.project_estimate_items(company_id, id)
      on delete set null (estimate_item_id);
  end if;
end $$;

create index if not exists expenses_estimate_idx
  on public.expenses(company_id, project_id, estimate_item_id, expense_date desc);

notify pgrst, 'reload schema';
commit;
