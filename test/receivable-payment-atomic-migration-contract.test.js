import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const migration=fs.readFileSync(path.join(root,'supabase/migrations/20261010160000_v1_14_atomic_receivables_payments.sql'),'utf8');
const service=fs.readFileSync(path.join(root,'src/services/procurementAccountingService.js'),'utf8');
const route=fs.readFileSync(path.join(root,'src/routes/procurementAccounting.js'),'utf8');
const ui=fs.readFileSync(path.join(root,'../HySmart-Build-Web/src/pages/Accounting.jsx'),'utf8');

test('atomic receivable payment locks invoice before balance checks and writes',()=>{
  const lock=migration.indexOf('for update');
  const limit=migration.indexOf('Payment exceeds receivable invoice balance');
  const payment=migration.indexOf('insert into public.accounts_receivable_payments');
  const balance=migration.indexOf('update public.accounts_receivable_invoices');
  const journal=migration.indexOf('insert into public.accounting_journals');
  const lines=migration.indexOf('insert into public.accounting_journal_lines');
  assert.ok(lock>=0 && limit>lock && payment>limit && balance>payment && journal>balance && lines>journal);
});

test('receivable payment transaction requires matching tenant, status, currency and accounting accounts',()=>{
  assert.match(migration,/where company_id=p_company_id and id=p_invoice_id for update/i);
  assert.match(migration,/v_invoice\.status not in \('ISSUED','PARTIALLY_PAID'\)/);
  assert.match(migration,/Payment currency must match receivable invoice currency/);
  assert.match(migration,/Required receivables-payment accounting accounts are not configured/);
  assert.match(migration,/revoke all on function public\.post_receivable_payment_atomic[\s\S]*from public, anon, authenticated/i);
  assert.match(migration,/grant execute on function public\.post_receivable_payment_atomic[\s\S]*to service_role/i);
});

test('receivable payment idempotency key is unique per company and replay payload is checked',()=>{
  assert.match(migration,/create unique index if not exists accounts_receivable_payments_company_idempotency_uq[\s\S]*on public\.accounts_receivable_payments\(company_id, idempotency_key\)/i);
  assert.match(migration,/Idempotency key was already used with a different payment payload/);
  assert.match(migration,/return to_jsonb\(v_existing\)/);
});

test('service uses atomic RPC and stable error mapping instead of separate payment writes',()=>{
  assert.match(service,/rpc\('post_receivable_payment_atomic'/);
  assert.match(service,/mapReceivablePaymentAtomicError\(error\)/);
  assert.doesNotMatch(service,/async payAR\([\s\S]{0,2200}?from\('accounts_receivable_payments'\)\.insert/);
});

test('API and Accounting UI pass a retry key for customer payment requests',()=>{
  assert.match(route,/idempotencyKey:z\.string\(\)\.trim\(\)\.min\(8\)\.max\(120\)\.optional\(\)/);
  assert.match(ui,/paymentRetryKeys=useRef\(new Map\(\)\)/);
  assert.match(ui,/idempotencyKey\}\);paymentRetryKeys\.current\.delete/);
});
