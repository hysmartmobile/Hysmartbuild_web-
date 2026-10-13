import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const web = path.resolve(root, '..', 'HySmart-Build-Web');
const read = (base, file) => fs.readFileSync(path.join(base, file), 'utf8');

test('v5.8 project and finance records are explicitly company scoped', () => {
  const project = read(root, 'src/services/projectService.js');
  const finance = read(root, 'src/services/financeService.js');
  const procurement = read(root, 'src/services/procurementAccountingService.js');
  for (const [label, source] of [['projects', project], ['finance', finance], ['procurement', procurement]]) {
    assert.match(source, /company_id/, `${label} must carry company scope`);
    assert.match(source, /\.eq\(['"]company_id['"],\s*companyId\)/, `${label} reads must scope records by company`);
  }
});

test('v5.8 procurement enforces approved supplier invoice and outstanding balance before payment', () => {
  const source = read(root, 'src/services/procurementAccountingService.js');
  const migration = read(root, 'supabase/migrations/20261010150000_v1_13_supplier_payments_atomic.sql');
  assert.match(source, /rpc\('post_supplier_payment_atomic'/);
  assert.match(migration, /Supplier invoice must be approved before payment/i);
  assert.match(migration, /Payment exceeds outstanding supplier invoice balance/i);
  assert.match(migration, /PARTIALLY_PAID/);
});

test('v5.8 treasury and margin use tenant-safe invoice-to-purchase-order joins', () => {
  for (const file of ['src/services/treasuryService.js', 'src/services/revenueMarginService.js', 'src/services/constructionErpService.js']) {
    assert.match(read(root, file), /supplier_invoices_po_tenant_fk/, `${file} must use the tenant-safe relationship`);
  }
});

test('v5.8 BOQ operating chain links schedule, production, procurement, cost and evidence', () => {
  const source = read(root, 'src/services/operatingSystemService.js');
  for (const table of [
    'project_schedule_activities', 'project_progress_measurements', 'project_material_plans',
    'purchase_order_items', 'project_productivity_records', 'project_subcontract_items',
    'project_ipc_items', 'documents', 'workflow_action_items'
  ]) assert.ok(source.includes(table), `BOQ operating chain missing ${table}`);
});

test('v5.8 offline sync is company-scoped, operation-idempotent and surfaces conflicts', () => {
  const service = read(root, 'src/services/syncService.js');
  const route = read(root, 'src/routes/sync.js');
  assert.match(service, /\.eq\("company_id", companyId\)\.eq\("operation_id", operationId\)/);
  assert.ok(service.includes('status:"CONFLICT"'));
  assert.match(service, /SYNC_CONFLICT/);
  assert.match(route, /authorize\("sync:push"\)/);
  assert.match(route, /authorize\("sync:read"\)/);
});

test('v5.8 browser sync preserves queued company identity and operation IDs', () => {
  const api = read(web, 'src/lib/api.js');
  const sync = read(web, 'src/lib/sync.js');
  assert.match(api, /companyId:queuedCompanyId/);
  assert.match(api, /operationId:op\.operationId\|\|crypto\.randomUUID\(\)/);
  assert.match(sync, /item\.companyId\|\|/);
});

test('v5.8 protected workflow checks do not replace existing release gate or migrations', () => {
  assert.ok(fs.existsSync(path.join(root, 'test', 'v5_7_release_gate.test.js')));
  assert.ok(fs.existsSync(path.join(root, 'supabase', 'migrations', '20261006070000_v4_5_boq_operating_chain.sql')));
  assert.ok(fs.existsSync(path.join(root, 'supabase', 'migrations', '20261006080000_v4_6_daily_intelligence_loop.sql')));
});
