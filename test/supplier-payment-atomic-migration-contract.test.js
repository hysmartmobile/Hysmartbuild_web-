import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const migration=fs.readFileSync(path.join(root,'supabase/migrations/20261010150000_v1_13_supplier_payments_atomic.sql'),'utf8');
const service=fs.readFileSync(path.join(root,'src/services/procurementAccountingService.js'),'utf8');

test('atomic supplier payment migration locks invoice before checking balance and inserting payment',()=>{
  const lock=migration.indexOf('for update');
  const balanceCheck=migration.indexOf('Payment exceeds outstanding supplier invoice balance');
  const insert=migration.indexOf('insert into public.supplier_payments');
  const update=migration.indexOf('update public.supplier_invoices');
  assert.ok(lock>=0 && balanceCheck>lock && insert>balanceCheck && update>insert);
});

test('atomic supplier payment validates status, currency, amount, tenant and service-role grant',()=>{
  assert.match(migration,/where company_id\s*=\s*p_company_id and id\s*=\s*p_invoice_id\s+for update/i);
  assert.match(migration,/v_invoice\.status not in \('APPROVED','PARTIALLY_PAID'\)/);
  assert.match(migration,/upper\(coalesce\(p_currency,''\)\) <> upper\(coalesce\(v_invoice\.currency,''\)\)/);
  assert.match(migration,/revoke all on function public\.post_supplier_payment_atomic[\s\S]*from public, anon, authenticated/i);
  assert.match(migration,/grant execute on function public\.post_supplier_payment_atomic[\s\S]*to service_role/i);
});

test('service uses atomic supplier-payment RPC and maps controlled database errors',()=>{
  assert.match(service,/rpc\('post_supplier_payment_atomic'/);
  assert.match(service,/mapSupplierPaymentAtomicError\(error\)/);
  assert.doesNotMatch(service,/async createSupplierPayment\([\s\S]{0,2000}?from\('supplier_payments'\)\.insert/);
});

test('supplier payment and posted accounting journal share one database transaction',()=>{
  assert.match(migration,/required supplier-payment accounting accounts are not configured/i);
  assert.match(migration,/insert into public\.accounting_journals/);
  assert.match(migration,/insert into public\.accounting_journal_lines/);
  assert.match(migration,/status, source_type, source_id, created_by, posted_by, posted_at/);
  assert.ok(migration.indexOf('insert into public.accounting_journal_lines') < migration.indexOf('return to_jsonb(v_payment)'));
});
