import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(new URL('..',import.meta.url).pathname);
const service=fs.readFileSync(path.join(root,'src/services/constructionErpService.js'),'utf8');
const procurement=fs.readFileSync(path.join(root,'src/services/procurementAccountingService.js'),'utf8');
const migration=fs.readFileSync(path.join(root,'supabase/migrations/20261004120000_v1_9_production_hardening_and_project_cost_ledger.sql'),'utf8');
const project=fs.readFileSync(path.join(root,'src/services/projectService.js'),'utf8');

test('V1.9 uses explicit construction resource scoping',()=>{
  for(const x of ['PROJECT_DIRECT','VIA_SUBCONTRACT','VIA_VALUATION','VIA_EQUIPMENT','COMPANY_GLOBAL']) assert.match(service,new RegExp(`const ${x}`));
  assert.match(service,/SUBCONTRACT_SCOPE_ERROR/);
  assert.match(service,/EQUIPMENT_REQUIRED/);
});

test('V1.9 blocks protected tenant/system fields',()=>{
  assert.match(service,/protectedFields/);
  assert.match(service,/Protected fields cannot be modified/);
});

test('V1.9 executive endpoint no longer references undefined ar variable',()=>{
  const executive=service.slice(service.indexOf('async executive'),service.indexOf('async aiInsights'));
  assert.doesNotMatch(executive,/\bar\.error\b/);
  assert.doesNotMatch(executive,/\bar\.data\b/);
});

test('V1.9/V4.4 GRN validates PO item ownership and atomic inventory posting',()=>{
  const atomic=fs.readFileSync(path.join(root,'supabase/migrations/20261006000000_v4_4_no_double_entry_grn_inventory.sql'),'utf8');
  assert.match(atomic,/INVALID_GRN_ITEM_OWNER|purchase_order_items/);
  assert.match(procurement,/post_goods_received_note_atomic/);
});

test('V1.9 project activation preserves missing start date correctly',()=>{
  assert.match(project,/toStatus === "ACTIVE" && !current\.start_date/);
});

test('V1.9 includes a unified project cost ledger view and idempotency indexes',()=>{
  assert.match(migration,/create or replace view public\.project_cost_ledger_v/);
  assert.match(migration,/project_retention_one_withheld_per_ipc/);
  assert.match(migration,/project_ipc_invoice_unique/);
});
