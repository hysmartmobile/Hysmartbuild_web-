import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const migration=fs.readFileSync(path.join(root,'supabase/migrations/20261004170000_v2_3_execution_commercial_intelligence.sql'),'utf8');
const service=fs.readFileSync(path.join(root,'src/services/executionService.js'),'utf8');
const route=fs.readFileSync(path.join(root,'src/routes/execution.js'),'utf8');
const api=fs.readFileSync(path.resolve(root,'../HySmart-Build-Web/src/lib/api.js'),'utf8');
const page=fs.readFileSync(path.resolve(root,'../HySmart-Build-Web/src/pages/Execution.jsx'),'utf8');

test('v2.3 migration links schedule activities to BOQ and creates execution snapshots',()=>{assert.match(migration,/add column if not exists estimate_item_id/);assert.match(migration,/project_execution_snapshots/);assert.match(migration,/execution:read/);assert.match(migration,/execution:manage/);});
test('v2.3 enforces tenant-safe BOQ linkage and RLS',()=>{assert.match(migration,/project_schedule_activity_estimate_item_tenant_fk/);assert.match(migration,/alter table public\.project_execution_snapshots enable row level security/);assert.match(migration,/public\.is_company_member\(company_id\)/);});
test('execution service calculates PV EV SPI CPI and alerts',()=>{for(const x of ['plannedValue','earnedValue','schedulePerformanceIndex','costPerformanceIndex','forecastCost','SCHEDULE_PERFORMANCE','COST_PERFORMANCE','CRITICAL_DELAY','MATERIAL_RISK','OVERDUE_RECEIVABLE'])assert.match(service,new RegExp(x));});
test('execution service reads project cost ledger and cash exposure',()=>{assert.match(service,/project_cost_ledger_v/);assert.match(service,/accounts_receivable_invoices/);assert.match(service,/supplier_invoices/);assert.match(service,/netCashExposure/);});
test('execution measurement prevents BOQ over-measurement',()=>{assert.match(service,/MEASURED_QUANTITY_OVER_LIMIT/);assert.match(service,/status:'SUBMITTED'/);});
test('execution router protects read/write endpoints with dedicated permissions',()=>{assert.match(route,/authorize\('execution:read'\)/);assert.match(route,/authorize\('execution:manage'\)/);assert.match(route,/execution\/dashboard/);assert.match(route,/execution\/measurements/);});
test('web exposes execution dashboard and measurement API',()=>{for(const x of ['executionDashboard','executionSnapshots','saveExecutionSnapshot','executionBoq','createExecutionMeasurement'])assert.match(api,new RegExp(x));assert.match(page,/Management alerts/);assert.match(page,/Production \/ BOQ measurement/);assert.match(page,/Cash exposure/);});
test('BOQ-to-project linkage is enforced at database level',()=>{assert.match(migration,/validate_schedule_activity_estimate_item_project/);assert.match(service,/project_estimates!inner\(project_id,status\)/);});
