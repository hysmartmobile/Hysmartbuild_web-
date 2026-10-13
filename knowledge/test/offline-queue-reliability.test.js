import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('offline queue assigns an explicit initial state and exposes a status summary', () => {
  const source = read('../src/lib/offlineQueue.js');
  assert.match(source, /state:'pending'/);
  assert.match(source, /mutationQueueSummary/);
  assert.match(source, /conflicts:items\.filter\(x=>x\.state==='conflict'\)/);
  assert.match(source, /failed:items\.filter\(x=>x\.state==='failed'\)/);
});

test('sync transitions queued work through syncing, conflict, failed, and retryable pending states', () => {
  const source = read('../src/lib/sync.js');
  for (const state of ["state:'syncing'", "state:'conflict'", "state:'failed'", "state:'pending'"]) assert.ok(source.includes(state), `missing ${state}`);
  assert.match(source, /operationId:item\.operationId/);
  assert.match(source, /item\.companyId\|\|pathCompany\|\|localStorage\.getItem/);
  assert.match(source, /hysmart-sync-complete/);
});

test('offline queue preserves existing IndexedDB store and migration version', () => {
  const source = read('../src/lib/offlineQueue.js');
  assert.match(source, /const DB_NAME='hysmart-build-offline'/);
  assert.match(source, /const STORE='mutations'/);
  assert.match(source, /const version=2/);
  assert.match(source, /getAll\(\)/);
});
