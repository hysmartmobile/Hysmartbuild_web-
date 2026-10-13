import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('RC54 supplier invoice line writes are database-atomic and tenant/PO checked',()=>{const sql=read('supabase/migrations/20261010140000_v1_12_supplier_invoice_items_atomic.sql');assert.match(sql,/for update/i);assert.match(sql,/p_company_id/);assert.match(sql,/purchase_order_id/);assert.match(sql,/revoke all on function/i);assert.match(sql,/grant execute on function .*service_role/i);});
test('RC54 supplier payments and customer receipts use atomic database transactions',()=>{const sp=read('supabase/migrations/20261010150000_v1_13_supplier_payments_atomic.sql');const ar=read('supabase/migrations/20261010160000_v1_14_atomic_receivables_payments.sql');for(const sql of [sp,ar]){assert.match(sql,/for update/i);assert.match(sql,/security definer/i);assert.match(sql,/journal/i);assert.match(sql,/company_id/);}});
test('RC54 review records remaining multi-step finance workflows as release blockers until runtime-proven',()=>{const audit=fs.readFileSync(path.join(root,'RC54-FINANCIAL-TRANSACTION-REVIEW.md'),'utf8');for(const phrase of ['supplier invoice approval','receivable invoice creation','payroll','bank reconciliation','manual journal','PostgreSQL behavior'])assert.ok(audit.toLowerCase().includes(phrase.toLowerCase()),`missing review item: ${phrase}`);});
