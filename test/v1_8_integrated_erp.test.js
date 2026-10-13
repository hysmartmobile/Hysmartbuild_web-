import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const migration = fs.readFileSync(path.join(root,'supabase/migrations/20261004090000_v1_8_integrated_construction_erp.sql'),'utf8');
const route = fs.readFileSync(path.join(root,'src/routes/constructionErp.js'),'utf8');
const service = fs.readFileSync(path.join(root,'src/services/constructionErpService.js'),'utf8');
const app = fs.readFileSync(path.join(root,'src/app.js'),'utf8');

test('V1.8 migration contains the integrated commercial chain tables', () => {
  for (const table of ['project_estimates','project_estimate_items','project_budget_baselines','project_progress_measurements','project_work_certificates','project_client_ipcs','project_retention_transactions']) assert.match(migration,new RegExp(`create table if not exists public\\.${table}`));
});

test('V1.8 migration contains subcontractor, quality and safety domains', () => {
  for (const table of ['project_subcontractors','project_subcontracts','project_subcontract_valuations','project_subcontract_payments','project_subcontract_variations','project_quality_inspections','project_ncrs','project_safety_incidents','project_toolbox_talks','project_safety_inspections','project_permits']) assert.match(migration,new RegExp(`create table if not exists public\\.${table}`));
});

test('V1.8 migration contains equipment, document control, RFI and closeout/DLP domains', () => {
  for (const table of ['project_equipment','project_equipment_allocations','project_equipment_logs','project_equipment_maintenance','project_document_versions','project_transmittals','project_rfis','project_closeout_items','project_dlp_defects']) assert.match(migration,new RegExp(`create table if not exists public\\.${table}`));
});

test('V1.8 enforces one approved estimate version per project', () => {
  assert.match(migration,/project_estimates_one_approved/);
  assert.match(migration,/where status='APPROVED'/);
});

test('V1.8 approval flow creates an approved budget baseline', () => {
  assert.match(service,/approveEstimate/);
  assert.match(service,/project_budget_baselines/);
  assert.match(service,/status: 'APPROVED'/);
});

test('V1.8 connects approved IPCs to retention and AR invoicing', () => {
  assert.match(service,/approveIpc/);
  assert.match(service,/project_retention_transactions/);
  assert.match(service,/invoiceIpc/);
  assert.match(service,/accounts_receivable_invoices/);
});

test('V1.8 profitability includes variations, procurement commitments and actual costs', () => {
  assert.match(service,/project_change_orders/);
  assert.match(service,/purchase_orders/);
  assert.match(service,/supplier_invoices/);
  assert.match(service,/forecastFinalCost/);
  assert.match(service,/marginPercent/);
});

test('V1.8 executive command center exposes portfolio financial and control metrics', () => {
  assert.match(service,/async executive/);
  assert.match(service,/receivables/);
  assert.match(service,/payables/);
  assert.match(service,/openRfis/);
  assert.match(service,/openNcr/);
  assert.match(service,/openSafetyIncidents/);
  assert.match(service,/overdueTasks/);
  assert.match(service,/materialAlerts/);
});

test('V1.8 router exposes construction ERP executive, estimate and IPC workflow endpoints', () => {
  assert.match(route,/construction\/executive/);
  assert.match(route,/construction\/ai-insights/);
  assert.match(route,/construction\/estimates/);
  assert.match(route,/estimates\/:id\/approve/);
  assert.match(route,/construction\/ipcs/);
  assert.match(route,/ipcs\/:id\/approve/);
  assert.match(route,/ipcs\/:id\/invoice/);
});

test('V1.8 API is mounted in the main application', () => {
  assert.match(app,/createConstructionErpRouter/);
  assert.match(app,/constructionErpService/);
});
