import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const migration = fs.readFileSync(path.join(root,'supabase/migrations/20261004150000_v2_0_commercial_project_controls.sql'),'utf8');
const construction = fs.readFileSync(path.join(root,'src/services/constructionErpService.js'),'utf8');
const route = fs.readFileSync(path.join(root,'src/routes/constructionErp.js'),'utf8');
const projectsRoute = fs.readFileSync(path.join(root,'src/routes/projects.js'),'utf8');
const projectService = fs.readFileSync(path.join(root,'src/services/projectService.js'),'utf8');
const webApi = fs.readFileSync(path.resolve(root,'../HySmart-Build-Web/src/lib/api.js'),'utf8');
const webPage = fs.readFileSync(path.resolve(root,'../HySmart-Build-Web/src/pages/ConstructionERP.jsx'),'utf8');

test('V2.0 migration adds cost codes, WBS and commercial controls',()=>{
  assert.match(migration,/create table if not exists public\.project_cost_codes/);
  assert.match(migration,/create table if not exists public\.project_wbs_nodes/);
  assert.match(migration,/alter table public\.project_change_orders add column if not exists approved_by/);
  assert.match(migration,/project_commercial_summary_v/);
  assert.match(migration,/security_invoker = true/);
});

test('V2.0 exposes commercial summary, BOQ import and controlled change-order transition APIs',()=>{
  assert.match(route,/commercial-summary/);
  assert.match(route,/estimates\/import/);
  assert.match(route,/change-orders\/:changeOrderId\/transition/);
  assert.match(construction,/async commercialSummary/);
  assert.match(construction,/async importEstimateItems/);
  assert.match(construction,/async transitionChangeOrder/);
});

test('V2.0 change orders cannot bypass the state machine',()=>{
  assert.match(projectService,/const allowed=\{DRAFT:\['SUBMITTED','CANCELLED'\]/);
  assert.match(projectService,/eq\('status','DRAFT'\)/);
  assert.match(projectsRoute,/transitionChangeOrder/);
});

test('V2.0 web commercial control center supports summary, CSV BOQ import and approvals',()=>{
  assert.match(webApi,/commercialSummary/);
  assert.match(webApi,/importEstimate/);
  assert.match(webApi,/transitionChangeOrder/);
  assert.match(webPage,/Commercial control center/);
  assert.match(webPage,/Import BOQ CSV/);
  assert.match(webPage,/Controlled workflow: Draft/);
});
