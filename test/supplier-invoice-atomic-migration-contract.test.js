import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here=dirname(fileURLToPath(import.meta.url));
const sql=readFileSync(join(here,'../supabase/migrations/20261010140000_v1_12_supplier_invoice_items_atomic.sql'),'utf8');

test('atomic invoice migration locks invoice row before duplicate check and inserts',()=>{
  const lock=sql.indexOf('for update;');
  const duplicate=sql.indexOf('Invoice lines already exist; duplicate submissions are blocked');
  const insert=sql.indexOf('insert into public.supplier_invoice_items');
  assert.ok(lock>=0 && duplicate>lock && insert>duplicate,'expected invoice row lock, duplicate recheck, then insert');
});

test('atomic invoice migration validates company, supplier, currency, PO item and header totals',()=>{
  for(const fragment of [
    'where company_id = p_company_id and id = p_invoice_id',
    'v_po.supplier_id <> v_invoice.supplier_id',
    'upper(v_po.currency) <> upper(v_invoice.currency)',
    'Every invoice line must reference an item on the invoice purchase order',
    'Invoice line values failed server-side calculation validation',
    'Invoice line totals must reconcile to the invoice header before saving'
  ]) assert.ok(sql.includes(fragment),`missing SQL invariant: ${fragment}`);
});

test('atomic invoice RPC is not executable by public, anon or authenticated roles',()=>{
  assert.match(sql,/revoke all on function public\.add_supplier_invoice_items_atomic\(uuid, uuid, jsonb\) from public, anon, authenticated/i);
  assert.match(sql,/grant execute on function public\.add_supplier_invoice_items_atomic\(uuid, uuid, jsonb\) to service_role/i);
});
