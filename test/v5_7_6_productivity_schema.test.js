import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../src/services/revenueMarginService.js', import.meta.url), 'utf8');
test('revenue-margin productivity query uses columns defined by the v2.4 schema', () => {
  assert.match(source, /select\('work_date,quantity_completed,labour_hours,worker_count'\)/);
  assert.doesNotMatch(source, /select\('productivity_index,output_quantity,target_quantity'\)/);
  assert.doesNotMatch(source, /order\('record_date'/);
  assert.match(source, /medianRate/);
});
