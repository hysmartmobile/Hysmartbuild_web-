import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateProjectCostPlan } from '../src/services/projectCostPlanningService.js';

test('cost plan calculates cost build-up, profit, margin and target price transparently', () => {
  const r = calculateProjectCostPlan({ contractValue: 150000000, materialsCost: 50000000, labourCost: 25000000, plantEquipmentCost: 5000000, subcontractCost: 10000000, otherDirectCost: 2000000, overheads: 12000000, durationMonths: 12, contingencyPct: 10, annualEscalationPct: 5, mobilisationPct: 20, materialsAdvancePct: 30, clientPaymentDelayDays: 45, supplierCreditDays: 30, targetMarginPct: 15, taxAllowancePct: 0, currency: 'NGN' });
  assert.equal(r.estimate.directCost, 92000000);
  assert.ok(r.estimate.expectedFinalCost > r.estimate.directCost + 12000000);
  assert.equal(r.commercial.forecastProfit, 150000000 - r.estimate.expectedFinalCost);
  assert.equal(r.commercial.targetMarginContractValue, Math.round(r.estimate.expectedFinalCost / .85 * 100) / 100);
  assert.ok(r.funding.recommendedClientAdvance >= 150000000 * .2);
  assert.ok(r.estimate.highCostRange >= r.estimate.expectedFinalCost);
  assert.ok(r.quality.dataCompletenessPct > 80);
  assert.equal(r.sourceStatus.historicalCalibration, 'NOT_YET_CALIBRATED');
});

test('cost plan warns when contract price is missing and project forecasts a loss', () => {
  const missing = calculateProjectCostPlan({ materialsCost: 100, labourCost: 50, overheads: 20, durationMonths: 0, contingencyPct: 0, targetMarginPct: 15 });
  assert.equal(missing.commercial.forecastProfit, -170);
  assert.ok(missing.risks.some(r => r.code === 'NO_CONTRACT_PRICE'));
  assert.ok(missing.quality.missingData.length > 0);
});

test('cost plan rejects invalid negative cost inputs and unrealistic margin', () => {
  assert.throws(() => calculateProjectCostPlan({ materialsCost: -1 }), /cannot be negative/);
  assert.throws(() => calculateProjectCostPlan({ targetMarginPct: 95 }), /between -100% and 90%/);
});
