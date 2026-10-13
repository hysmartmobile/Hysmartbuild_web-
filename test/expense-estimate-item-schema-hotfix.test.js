import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('RC60 repairs the expenses estimate_item_id column used by live expense queries', () => {
  const migration = read('supabase/migrations/20261011170000_v5_7_13_repair_expense_estimate_item.sql');
  const service = read('src/services/financeService.js');
  assert.match(migration, /alter table public\.expenses\s+add column if not exists estimate_item_id uuid/i);
  assert.match(migration, /create index if not exists expenses_estimate_idx/i);
  assert.match(migration, /project_estimate_items_company_id_id_uq unique \(company_id, id\)/i);
  assert.match(migration, /expense_estimate_tenant_fk/);
  assert.match(migration, /notify pgrst, 'reload schema'/i);
  assert.match(service, /notes,estimate_item_id,supplier_invoice_id/);
});

test('RC60 adds the composite referenced key before creating the tenant-safe foreign key', () => {
  const migration = read('supabase/migrations/20261011170000_v5_7_13_repair_expense_estimate_item.sql');
  assert.ok(migration.indexOf('add constraint project_estimate_items_company_id_id_uq') < migration.indexOf('add constraint expense_estimate_tenant_fk'));
  assert.match(migration, /unique \(company_id, id\)/i);
});

test('RC60 expense BOQ relationship preserves company isolation and does not null company_id on delete', () => {
  const migration = read('supabase/migrations/20261011170000_v5_7_13_repair_expense_estimate_item.sql');
  assert.match(migration, /foreign key \(company_id, estimate_item_id\)/i);
  assert.match(migration, /references public\.project_estimate_items\(company_id, id\)/i);
  assert.match(migration, /on delete set null \(estimate_item_id\)/i);
  assert.doesNotMatch(migration, /on delete set null\s*;/i);
});
