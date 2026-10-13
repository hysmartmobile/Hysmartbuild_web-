import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');

test('v5.9 cost plans persist company/project scoped scenarios behind dedicated permissions', () => {
  const migration = read('../supabase/migrations/20261013180000_v5_9_1_project_cost_funding_plans.sql');
  const route = read('../src/routes/projectCostPlanning.js');
  const service = read('../src/services/projectCostPlanningService.js');
  assert.match(migration, /company_id uuid not null references public\.companies/);
  assert.match(migration, /project_id uuid not null references public\.projects/);
  assert.match(migration, /enable row level security/i);
  assert.match(route, /authorize\('project-cost-plan:manage'\)/);
  assert.match(route, /authorize\('project-cost-plan:read'\)/);
  assert.match(service, /\.eq\('company_id', companyId\)\.eq\('id', projectId\)/);
  assert.match(service, /project_members/);
  assert.match(service, /PROJECT_ACCESS_DENIED/);
  assert.match(service, /unmatchedLedgerCurrencies/);
});

test('v5.9 frontend exposes project cost planning and states estimate limitations', () => {
  const app = read('../../HySmart-Build-Web/src/pages/ProjectCostPlanning.jsx');
  const routes = read('../../HySmart-Build-Web/src/App.jsx');
  const nav = read('../../HySmart-Build-Web/src/components/Layout.jsx');
  const api = read('../../HySmart-Build-Web/src/lib/api.js');
  assert.match(routes, /path="project-cost-planning" element=\{<ProjectCostPlanning\/>\}/);
  assert.match(nav, /Cost & Funding Plan.*project-cost-plan:read/);
  assert.match(api, /projectCostPlan:\(projectId,p\)/);
  assert.match(app, /Expected final cost/);
  assert.match(app, /Recommended upfront advance/);
  assert.match(app, /does not guarantee project profitability/);
});
