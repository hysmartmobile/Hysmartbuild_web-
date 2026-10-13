-- HySmart Build RC45: READ-ONLY staging financial-link verification.
-- Run in the Supabase SQL Editor for the intended STAGING project only.
-- This script performs catalog inspection and SELECTs; it does not mutate data.
with checks as (
  select
    'expenses.supplier_invoice_id column exists' as check_name,
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'expenses'
        and column_name = 'supplier_invoice_id' and data_type = 'uuid'
    ) as passed,
    'Expected UUID column added by V1.10 migration' as detail
  union all
  select
    'tenant-safe expense-to-invoice foreign key exists and is validated',
    exists (
      select 1 from pg_constraint c
      join pg_class child on child.oid = c.conrelid
      join pg_namespace ns on ns.oid = child.relnamespace
      where ns.nspname = 'public' and child.relname = 'expenses'
        and c.conname = 'expenses_supplier_invoice_tenant_fk'
        and c.contype = 'f' and c.convalidated
        and pg_get_constraintdef(c.oid) ilike '%FOREIGN KEY (company_id, supplier_invoice_id)%'
        and pg_get_constraintdef(c.oid) ilike '%REFERENCES supplier_invoices(company_id, id)%'
    ),
    'Must bind company_id and invoice id together; a single-column FK is insufficient'
  union all
  select
    'supplier invoice has company/id unique key for tenant FK',
    exists (
      select 1 from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace ns on ns.oid = t.relnamespace
      where ns.nspname = 'public' and t.relname = 'supplier_invoices'
        and c.contype = 'u'
        and pg_get_constraintdef(c.oid) ilike 'UNIQUE (company_id, id)%'
    ),
    'Parent table must expose UNIQUE(company_id, id)'
  union all
  select
    'supplier invoice lookup index exists',
    to_regclass('public.expenses_supplier_invoice_idx') is not null,
    'Expected partial index on (company_id, supplier_invoice_id)'
  union all
  select
    'expenses row-level security is enabled',
    coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.expenses')), false),
    'RLS must remain enabled for tenant data'
  union all
  select
    'supplier_invoices row-level security is enabled',
    coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.supplier_invoices')), false),
    'RLS must remain enabled for supplier invoice data'
  union all
  select
    'expenses has at least one RLS policy',
    exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'expenses'),
    'Review policy predicates and authenticated-user behavior separately'
  union all
  select
    'supplier_invoices has at least one RLS policy',
    exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'supplier_invoices'),
    'Review policy predicates and authenticated-user behavior separately'
  union all
  select 'RC58 atomic supplier invoice approval RPC exists',
    exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='approve_supplier_invoice_atomic'),
    'Apply V1.15 migration before enabling invoice approval'
  union all
  select 'RC58 atomic receivable invoice RPC exists',
    exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='create_receivable_invoice_atomic'),
    'Invoice and journal must be created in one database transaction'
  union all
  select 'RC58 atomic manual journal RPC exists',
    exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='post_accounting_journal_atomic'),
    'Header, lines and posting must be atomic'
  union all
  select 'RC58 atomic payroll and bank RPCs exist',
    (select count(*)=4 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('create_payroll_run_atomic','transition_payroll_run_atomic','create_bank_transaction_atomic','reconcile_bank_transaction_atomic')),
    'Expected payroll creation/status and bank creation/reconciliation functions'
  union all
  select 'RC58 atomic RPCs are service_role-only',
    not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname in ('approve_supplier_invoice_atomic','create_receivable_invoice_atomic','post_accounting_journal_atomic','create_payroll_run_atomic','transition_payroll_run_atomic','create_bank_transaction_atomic','reconcile_bank_transaction_atomic')
        and (has_function_privilege('authenticated',p.oid,'EXECUTE') or has_function_privilege('anon',p.oid,'EXECUTE') or not has_function_privilege('service_role',p.oid,'EXECUTE'))
    ),
    'Functions must not be callable by browser roles'
  union all
  select 'Posted journals have balanced lines per currency',
    not exists (
      select 1 from public.accounting_journals j
      left join public.accounting_journal_lines l on l.journal_id=j.id
      where j.status='POSTED'
      group by j.id, l.currency
      having coalesce(sum(l.debit),0)<=0 or round(coalesce(sum(l.debit),0),4)<>round(coalesce(sum(l.credit),0),4)
    ),
    'Investigate any posted journal with missing, unbalanced or cross-currency lines'
  union all
  select 'Core finance tables have RLS enabled',
    (select count(*)=7 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('supplier_invoices','accounts_receivable_invoices','accounting_journals','accounting_journal_lines','payroll_runs','payroll_items','bank_transactions') and c.relrowsecurity),
    'RLS is necessary but does not replace negative tests with real user tokens'
)
select check_name, case when passed then 'PASS' else 'FAIL' end as result, detail
from checks
order by passed asc, check_name asc;
