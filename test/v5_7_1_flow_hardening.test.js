import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const web = path.join(root, 'HySmart-Build-Web');
const read = file => fs.readFileSync(file, 'utf8');

test('v5.7.1 web shell cache is versioned past v5.6.1', () => {
  const sw = read(path.join(web, 'public', 'sw.js'));
  assert.match(sw, /const CACHE_PREFIX = 'hysmart-shell-'/);
  assert.match(sw, /const CACHE_NAME = `\$\{CACHE_PREFIX\}v5\.7\.8-rc34`/);
  assert.doesNotMatch(sw, /hysmart-shell-v5\.6\.1/);
});

test('v5.7.1 browser boot registers one online sync listener', () => {
  const source = read(path.join(web, 'src', 'main.jsx'));
  const listeners = source.match(/window\.addEventListener\('online'/g) || [];
  assert.equal(listeners.length, 1);
});

test('v5.7.1 offline queue is explicit, idempotent and company scoped', () => {
  const source = read(path.join(web, 'src', 'lib', 'api.js'));
  assert.doesNotMatch(source, /offlineSafe/);
  assert.match(source, /method!==['"]GET['"] && op && typeof indexedDB/);
  assert.match(source, /companyId:queuedCompanyId/);
  assert.match(source, /operationId:op\.operationId\|\|crypto\.randomUUID\(\)/);
});

test('v5.7.1 offline sync resolves the queued company before replay', () => {
  const source = read(path.join(web, 'src', 'lib', 'sync.js'));
  assert.match(source, /item\.companyId\|\|/);
  assert.match(source, /pathCompany/);
  assert.match(source, /No company workspace is available/);
  assert.match(source, /const path=`?item\.sync/);
});

test('v5.7.1 supported field operations use the server sync contract', () => {
  const source = read(path.join(web, 'src', 'lib', 'api.js'));
  for (const operation of [
    'CREATE_PROJECT','UPDATE_PROJECT','CREATE_TASK','UPDATE_TASK',
    'CREATE_ISSUE','UPDATE_ISSUE','CREATE_REPORT','UPDATE_REPORT',
    'CREATE_ATTENDANCE','CREATE_MATERIAL','CREATE_MATERIAL_REQUEST','INVENTORY_MOVEMENT'
  ]) assert.match(source, new RegExp(`operationType:'${operation}'`));
});


test('v5.7.1 project creation persists construction type and caller-supplied offline id', () => {
  const source = read(path.join(root, 'HySmart-Build-Backend', 'src', 'services', 'projectService.js'));
  assert.match(source, /id: input\.id \|\| randomUUID\(\)/);
  assert.match(source, /construction_type: input\.constructionType \|\| "BUILDING"/);
});

test('v5.7.1 issue creation accepts the offline entity id', () => {
  const source = read(path.join(root, 'HySmart-Build-Backend', 'src', 'services', 'workService.js'));
  assert.match(source, /id:input\.id\|\|randomUUID\(\)/);
});

test('v5.7.1 inventory movement carries its idempotency operation id into the RPC payload', () => {
  const source = read(path.join(root, 'HySmart-Build-Web', 'src', 'lib', 'api.js'));
  assert.match(source, /const operationId=p\.operationId\|\|crypto\.randomUUID\(\)/);
  assert.match(source, /operationId,operationType:'INVENTORY_MOVEMENT'/);
});
