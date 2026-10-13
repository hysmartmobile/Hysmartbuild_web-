import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const migration=fs.readFileSync(path.join(root,'supabase/migrations/20261010170000_v1_15_atomic_financial_workflows.sql'),'utf8');
const service=fs.readFileSync(path.join(root,'src/services/procurementAccountingService.js'),'utf8');
const myWorkMigration=fs.readFileSync(path.join(root,'supabase/migrations/20261013100000_v5_7_15_personal_my_work_workflows.sql'),'utf8');

test('RC58 supplier invoice approval and payable journal share one database transaction',()=>{
  assert.match(migration,/create or replace function public\.approve_supplier_invoice_atomic/);
  assert.match(migration,/where company_id=p_company_id and id=p_invoice_id for update/);
  assert.match(migration,/status='APPROVED',approved_by=p_user_id,approved_at=now\(\)/);
  assert.match(migration,/source_type='SUPPLIER_INVOICE'[\s\S]{0,120}v_invoice\.id/);
  assert.match(service,/p_entity_type:'SUPPLIER_INVOICE'/);
  assert.match(myWorkMigration,/select public\.approve_supplier_invoice_atomic\(p_company_id,p_entity_id,p_user_id\) into v_row/);
  assert.doesNotMatch(service,/async approveSupplierInvoice\([^]*?\.update\(\{status:'APPROVED'/);
});

test('RC58 receivable invoice and posted journal are created atomically with company checks',()=>{
  assert.match(migration,/create or replace function public\.create_receivable_invoice_atomic/);
  assert.match(migration,/Project not found for this company/);
  assert.match(migration,/Required receivables accounting accounts are not configured/);
  assert.match(migration,/'AR_INVOICE',v_invoice\.id,p_created_by,p_created_by,now\(\)/);

  assert.match(service,/rpc\('create_receivable_invoice_atomic'/);
  assert.doesNotMatch(service,/async createAR\([^]*?\.from\('accounts_receivable_invoices'\)\.insert/);
});

test('RC58 manual journal posting validates all tenant-linked references and posts in one transaction',()=>{
  assert.match(migration,/create or replace function public\.post_accounting_journal_atomic/);
  assert.match(migration,/Journal account does not belong to this company/);
  assert.match(migration,/Journal project does not belong to this company/);
  assert.match(migration,/Journal cost code does not belong to this company/);
  assert.match(migration,/Journal site does not belong to this company/);
  assert.match(migration,/alter table public\.accounting_journal_lines enable row level security/);
  assert.match(migration,/accounting_journal_lines_member_read/);
  assert.match(migration,/round\(v_debit,4\)<>round\(v_credit,4\)/);
  assert.match(service,/rpc\('post_accounting_journal_atomic'/);
});

test('RC58 payroll header/items creation and status transitions are guarded database transactions',()=>{
  assert.match(migration,/create or replace function public\.create_payroll_run_atomic/);
  assert.match(migration,/insert into public\.payroll_items/);
  assert.match(migration,/v_item_tax\+v_item_ded>v_item_gross/);
  assert.match(migration,/create or replace function public\.transition_payroll_run_atomic/);
  assert.match(migration,/Only approved payroll can be marked paid/);
  assert.match(migration,/source_type='PAYROLL_RUN'/);
  assert.match(migration,/Required payroll accounting accounts are not configured/);
  assert.match(service,/rpc\('create_payroll_run_atomic'/);
  assert.match(service,/p_entity_type:'PAYROLL_RUN'/);
  assert.match(myWorkMigration,/select public\.transition_payroll_run_atomic\(p_company_id,p_entity_id,p_user_id,'PAID',current_date\) into v_row/);
});

test('RC58 bank reconciliation is row-locked, company-scoped and idempotent',()=>{
  assert.match(migration,/create or replace function public\.reconcile_bank_transaction_atomic/);
  assert.match(migration,/where company_id=p_company_id and id=p_transaction_id for update/);
  assert.match(migration,/if not v_tx\.reconciled then update public\.bank_transactions/);
  assert.match(service,/rpc\('reconcile_bank_transaction_atomic'/);
  assert.match(migration,/create or replace function public\.create_bank_transaction_atomic/);
  assert.match(migration,/Bank account not found for this company/);
  assert.match(service,/rpc\('create_bank_transaction_atomic'/);
});

test('RC58 all new financial RPCs are revoked from public clients and granted only to service_role',()=>{
  for(const name of ['approve_supplier_invoice_atomic','create_receivable_invoice_atomic','post_accounting_journal_atomic','create_payroll_run_atomic','transition_payroll_run_atomic','create_bank_transaction_atomic','reconcile_bank_transaction_atomic']){
    assert.match(migration,new RegExp(`revoke all on function public\\.${name}\\([^;]+ from public,anon,authenticated;`));
    assert.match(migration,new RegExp(`grant execute on function public\\.${name}\\([^;]+ to service_role;`));
  }
});

test('RC58 restore rehearsal refuses production-like targets and requires an empty isolated database',()=>{
  const script=fs.readFileSync(path.join(root,'scripts/restore-rehearsal.sh'),'utf8');
  assert.match(script,/RESTORE_TO_EMPTY_ISOLATED_DATABASE/);
  assert.match(script,/restore\[_-\]\?test\|staging\[_-\]\?restore/);
  assert.match(script,/public schema is not empty/);
  assert.match(script,/pg_restore --exit-on-error --no-owner --no-privileges/);
  assert.doesNotMatch(script,/pg_restore[^\n]*--clean/);
});

test('RC58 read-only staging verification checks RPC grants, journal balance and finance-table RLS',()=>{
  const sql=fs.readFileSync(path.join(root,'scripts/staging-financial-verification.sql'),'utf8');
  assert.match(sql,/RC58 atomic supplier invoice approval RPC exists/);
  assert.match(sql,/RC58 atomic RPCs are service_role-only/);
  assert.match(sql,/Posted journals have balanced lines per currency/);
  assert.match(sql,/Core finance tables have RLS enabled/);
  assert.match(sql,/order by passed asc/);
});
