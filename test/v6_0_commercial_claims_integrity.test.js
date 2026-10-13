import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('claims intelligence selects progress measurement columns that exist in the canonical schema', () => {
  const service = read('src/services/claimsIntelligenceService.js');
  const schema = read('supabase/migrations/20261004090000_v1_8_integrated_construction_erp.sql');
  const query = service.match(/from\('project_progress_measurements'\)\.select\('([^']+)'\)/)?.[1];
  assert.ok(query, 'progress measurement query must be explicit');
  for (const column of ['id', 'project_id', 'quantity_completed', 'measured_value', 'status', 'measurement_date']) {
    assert.ok(query.split(',').includes(column), `query must select ${column}`);
    assert.match(schema, new RegExp('\\b' + column + '\\b'), `schema must define ${column}`);
  }
  assert.ok(!query.split(',').includes('amount'), 'must not request the nonexistent amount column');
});

test('approved progress value uses the selected measured_value field only', () => {
  const service = read('src/services/claimsIntelligenceService.js');
  assert.match(service, /pm\.filter\(x=>x\.status==='APPROVED'\)\.reduce\(\(s,x\)=>s\+n\(x\.measured_value\),0\)/);
});

test('claims intelligence queries remain company-scoped and project filtering remains optional', () => {
  const service = read('src/services/claimsIntelligenceService.js');
  for (const table of ['project_change_orders', 'collaboration_rfis', 'collaboration_site_instructions', 'documents', 'project_progress_measurements']) {
    const start = service.indexOf(`from('${table}')`);
    assert.notEqual(start, -1, `missing ${table} query`);
    const segment = service.slice(start, service.indexOf(']),', start) === -1 ? start + 260 : service.indexOf(']),', start));
    assert.match(segment, /eq\('company_id',companyId\)/, `${table} must be scoped to company`);
  }
  assert.match(service, /!projectId\|\|x\.project_id===projectId/);
});

test('commercial claims remain connected to existing protected API and permissions', () => {
  const route = read('src/routes/strategicIntelligence.js');
  assert.match(route, /claims-intelligence/);
  assert.match(route, /contract-intelligence:read/);
  const app = read('src/app.js');
  assert.match(app, /ClaimsIntelligenceService/);
});
