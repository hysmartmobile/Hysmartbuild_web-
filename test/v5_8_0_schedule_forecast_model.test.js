import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduleFeatures, trainLogistic, score, evaluate } from '../src/services/scheduleForecastService.js';

test('schedule features are bounded, numeric and stable for incomplete schedule rows', () => {
  const x = scheduleFeatures({ calendar_days: 45, is_critical: true, total_float_days: -2, activity_type: 'TASK' });
  assert.equal(x.length, 4);
  assert.ok(x.every(Number.isFinite));
  assert.equal(x[1], 1);
  assert.equal(x[2], -2 / 90);
  assert.ok(x[0] > 0 && x[0] < 1);
});

test('logistic training learns a useful signal from a separable synthetic history', () => {
  const rows = Array.from({ length: 80 }, (_, i) => ({ x: [i < 40 ? 0.1 : 0.9, i < 40 ? 0 : 1, i < 40 ? 0.8 : 0.05, 0], y: i < 40 ? 0 : 1 }));
  const weights = trainLogistic(rows);
  const lowRisk = score(weights, [0.1, 0, 0.8, 0]);
  const highRisk = score(weights, [0.9, 1, 0.05, 0]);
  assert.ok(lowRisk >= 0 && lowRisk <= 1);
  assert.ok(highRisk >= 0 && highRisk <= 1);
  assert.ok(highRisk > lowRisk);
});

test('holdout evaluation reports bounded, finite classification and calibration metrics', () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({ x: [i / 20, i > 10 ? 1 : 0, 0.2, 0], y: i > 10 ? 1 : 0 }));
  const metrics = evaluate(trainLogistic(rows.slice(0, 15)), rows.slice(15));
  assert.equal(metrics.sampleCount, 5);
  for (const key of ['accuracy', 'precision', 'recall', 'brierScore']) assert.ok(Number.isFinite(metrics[key]) && metrics[key] >= 0 && metrics[key] <= 1);
});

test('v5.8 forecast migration is additive, tenant-scoped and separates training permission', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const migration = fs.readFileSync(path.join(new URL('..', import.meta.url).pathname, 'supabase/migrations/20261013170000_v5_8_0_trained_schedule_forecasting.sql'), 'utf8');
  const route = fs.readFileSync(path.join(new URL('..', import.meta.url).pathname, 'src/routes/strategicIntelligence.js'), 'utf8');
  assert.match(migration, /hysmart_forecast_models/);
  assert.match(migration, /hysmart_forecast_predictions/);
  assert.match(migration, /foreign key \(company_id, project_id, activity_id\)/);
  assert.match(migration, /intelligence-model:train/);
  assert.match(route, /authorize\('intelligence-model:train'\)/);
  assert.match(route, /assertProjectAccess/);
});
