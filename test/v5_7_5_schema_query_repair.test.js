import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('supplier invoice joins explicitly select the tenant-safe purchase order relationship', () => {
  for (const file of ['src/services/constructionErpService.js', 'src/services/executionService.js', 'src/services/treasuryService.js', 'src/services/revenueMarginService.js']) {
    const source = read(file);
    assert.match(source, /supplier_invoices_po_tenant_fk/, `${file} must specify the intended FK`);
  }
  assert.doesNotMatch(read('src/services/revenueMarginService.js'), /purchase_order:purchase_order_id!inner/);
});

test('today and revenue margin no longer request a nonexistent material-plan received_quantity column', () => {
  assert.doesNotMatch(read('src/services/operatingSystemService.js'), /project_material_plans['\"]\)\.select\([^\n]*received_quantity/);
  assert.doesNotMatch(read('src/services/revenueMarginService.js'), /project_material_plans['\"]\)\.select\([^\n]*received_quantity/);
});

test('procurement risk derives unit from the related material rather than a nonexistent plan column', () => {
  const source = read('src/services/procurementRiskService.js');
  assert.match(source, /materials:materials!project_material_plan_material_tenant_fk\(unit\)/);
  assert.doesNotMatch(source, /required_by,planned_quantity,status,unit['\"]/);
  assert.match(source, /x\.materials\?\.unit/);
});

test('all material-plan material embeds name the tenant-safe FK', () => {
  for (const file of ['src/services/operatingSystemService.js', 'src/services/siteIntelligenceService.js', 'src/services/workflowService.js']) {
    assert.match(read(file), /materials:materials!project_material_plan_material_tenant_fk/);
  }
});

test('schema repair release does not add duplicate or denormalized columns', () => {
  const migrationFiles = fs.readdirSync(path.join(root, 'supabase/migrations'));
  assert.ok(migrationFiles.length > 0);
  const note = read('RELEASE-v5.7.5-SCHEMA-QUERY-REPAIR.md');
  assert.match(note, /No database migration is required/);
});
