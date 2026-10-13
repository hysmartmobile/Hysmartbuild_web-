import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AiIntelligenceService } from '../src/services/aiIntelligenceService.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const sampleTruth = {
  generatedAt: '2026-10-13T00:00:00.000Z',
  truth: {
    time: { estimatedDelayDays: 7, delayedActivities: 2 },
    money: { marginLeakage: 900000, forecastMargin: 120000, revenueRecoveryOpportunity: 40000 },
    cash: { outstandingAr: 200000 },
    procurement: { summary: { critical: 2 }, risks: [{ material_id: 'steel', outstanding: 20 }] },
    contract: { summary: { potentialEntitlements: 1 } },
    execution: { workfronts: { blocked: 1 }, productionRecommendations: [] },
    consequences: { estimatedAdditionalPreliminaries: 10000 }
  },
  recommendations: [
    { type: 'MONEY', priority: 'NOW', statement: 'Margin leakage is 900000.', action: 'Review finance.', evidence: ['commercial'] },
    { type: 'MATERIAL', priority: 'NOW', statement: '2 material risks are critical.', action: 'Review procurement.', evidence: ['procurement'] },
    { type: 'CONTRACT', priority: 'NOW', statement: '1 contract signal needs review.', action: 'Review contract.', evidence: ['contract'] },
    { type: 'EXECUTION', priority: 'NOW', statement: '1 workfront is blocked.', action: 'Review workfront.', evidence: ['production'] }
  ], confidence: 80
};

test('assistant context omits finance, procurement and contract data without matching permissions', () => {
  const service = new AiIntelligenceService({});
  const context = service.buildPermittedContext({
    project: { id: 'p1', name: 'Test project', status: 'ACTIVE', expected_end_date: null },
    intelligence: sampleTruth,
    permissions: ['task:read']
  });
  assert.equal('financial' in context, false);
  assert.equal('procurement' in context, false);
  assert.equal('contract' in context, false);
  assert.equal(context.recommendations.some(x => x.type === 'MONEY'), false);
  assert.equal(context.recommendations.some(x => x.type === 'MATERIAL'), false);
  assert.equal(context.recommendations.some(x => x.type === 'CONTRACT'), false);
});

test('assistant context includes only functional categories the user is authorised to see', () => {
  const service = new AiIntelligenceService({});
  const context = service.buildPermittedContext({
    project: { id: 'p1', name: 'Test project', status: 'ACTIVE', expected_end_date: null },
    intelligence: sampleTruth,
    permissions: ['finance:read', 'procurement:read', 'construction-truth:read']
  });
  assert.equal('financial' in context, true);
  assert.equal('procurement' in context, true);
  assert.equal('contract' in context, false);
  assert.equal(context.recommendations.some(x => x.type === 'CONTRACT'), false);
});

test('assistant fallback is grounded and labels insufficient context instead of inventing facts', () => {
  const service = new AiIntelligenceService({});
  const result = service.fallbackAnswer('What is our unpaid payroll?', { project: { name: 'Test project' }, recommendations: [] });
  assert.equal(result.source, 'INSUFFICIENT_CONTEXT');
  assert.match(result.answer, /not contain enough evidence/i);
});

test('assistant endpoint uses dedicated permission and project-scoped service authorization', () => {
  const route = fs.readFileSync(path.join(root, 'src/routes/strategicIntelligence.js'), 'utf8');
  const service = fs.readFileSync(path.join(root, 'src/services/aiIntelligenceService.js'), 'utf8');
  const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261013150000_v5_7_17_hysmart_intelligence_assistant.sql'), 'utf8');
  assert.match(route, /authorize\('ai-assistant:use'\)/);
  assert.match(service, /role !== 'CLIENT'/);
  assert.match(service, /permissions.includes\('intelligence-predictions:read'\)/);
  assert.match(service, /eq\('company_id', companyId\)\.eq\('project_id', projectId\)/);
  assert.match(service, /PROJECT_ACCESS_DENIED/);
  assert.match(migration, /'WORKER','ai-assistant:use'/);
  assert.match(migration, /'CLIENT','ai-assistant:use'/);
});

test('role-scoped assistant fetches only authorised intelligence domains', async () => {
  const project = { id: 'p1', name: 'Test project', status: 'ACTIVE', expected_end_date: '2026-12-01', daily_preliminaries: 1000 };
  const membership = { id: 'pm1' };
  const schedule = [{ id: 'a1', name: 'Concrete', planned_finish: '2026-10-01', forecast_finish: '2026-10-05', status: 'IN_PROGRESS' }];
  const supabase = { from(table) {
    const query = {
      select() { return this; }, eq() { return this; }, neq() { return this; }, order() { return this; }, limit() { return this; },
      maybeSingle() { return Promise.resolve({ data: table === 'projects' ? project : membership, error: null }); },
      then(resolve, reject) { return Promise.resolve({ data: table === 'project_schedule_activities' ? schedule : table === 'projects' ? project : membership, error: null }).then(resolve, reject); }
    };
    return query;
  }};
  let financeCalls = 0, procurementCalls = 0, contractCalls = 0, executionCalls = 0;
  const truthEngineService = {
    revenueMarginService: { analyze: async () => { financeCalls++; throw new Error('finance data must not be fetched'); } },
    procurementRiskService: { analyze: async () => { procurementCalls++; throw new Error('procurement data must not be fetched'); } },
    claimsIntelligenceService: { analyze: async () => { contractCalls++; throw new Error('contract data must not be fetched'); } },
    workfrontProductionService: { dashboard: async () => { executionCalls++; throw new Error('execution data must not be fetched'); } },
    operatingSystemService: { boq: async () => { throw new Error('BOQ data must not be fetched'); } }
  };
  const service = new AiIntelligenceService({ supabase, truthEngineService });
  const result = await service.explainProject({ companyId: 'c1', userId: 'u1', role: 'SITE_ENGINEER', projectId: 'p1', permissions: ['task:read'] });
  assert.equal(result.truth.money, null);
  assert.equal(result.truth.procurement, null);
  assert.equal(result.truth.contract, null);
  assert.equal(result.truth.execution, null);
  assert.equal(result.truth.time.estimatedDelayDays, 4);
  assert.equal(result.truth.truthConfidence, 100);
  assert.equal(financeCalls + procurementCalls + contractCalls + executionCalls, 0);
});
