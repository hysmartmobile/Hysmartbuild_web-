import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const cwd=process.cwd(); const root=path.basename(cwd)==='HySmart-Build-Backend'?cwd:path.resolve('HySmart-Build-Backend');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');

test('v5.4 financial intelligence wiring and safety controls are present',()=>{
 const app=read('src/app.js'); const rbac=read('src/rbac.js'); const migration=read('supabase/migrations/20261006140000_v5_4_financial_intelligence.sql'); const service=read('src/services/financialIntelligenceService.js'); const route=read('src/routes/financialIntelligence.js');
 assert.match(app,/FinancialIntelligenceService/); assert.match(app,/createFinancialIntelligenceRouter/);
 assert.match(rbac,/financial-intelligence:read/); assert.match(rbac,/financial-intelligence:manage/);
 assert.match(route,/financial-intelligence/); assert.match(route,/authorize\('financial-intelligence:read'\)/); assert.match(route,/authorize\('financial-intelligence:manage'\)/);
 assert.match(migration,/financial_intelligence_snapshots/); assert.match(migration,/is_company_member\(company_id\)/);
 assert.match(service,/bank_transactions/); assert.match(service,/accounts_receivable_invoices/); assert.match(service,/supplier_invoices/); assert.match(service,/payroll_runs/); assert.match(service,/project_equipment_logs/); assert.match(service,/project_cost_ledger_v/);
 assert.match(service,/No autonomous payment, payroll, bank or accounting approval/);
});

test('v5.4 web financial intelligence route and API remain connected',()=>{
 const app=read('../HySmart-Build-Web/src/App.jsx'); const api=read('../HySmart-Build-Web/src/lib/api.js'); const page=read('../HySmart-Build-Web/src/pages/FinancialIntelligence.jsx'); const layout=read('../HySmart-Build-Web/src/components/Layout.jsx');
 assert.match(app,/import FinancialIntelligence/); assert.match(app,/path="financial-intelligence"/);
 assert.match(api,/financialIntelligence:/); assert.match(api,/refreshFinancialIntelligence:/);
 assert.match(page,/Financial Intelligence/); assert.match(page,/refreshFinancialIntelligence/);
 assert.match(layout,/Financial Intelligence/);
});

test('v5.4 readiness requires the financial intelligence snapshot schema',()=>{ const svc=read('src/service.js'); assert.match(svc,/financial_intelligence_snapshots/); assert.match(svc,/20261006140000_v5_4_financial_intelligence/); });
