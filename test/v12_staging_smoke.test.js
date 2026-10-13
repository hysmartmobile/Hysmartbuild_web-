import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('v12 staging smoke check is read-only and checks app, schema readiness, and Supabase', () => {
  const script = read('HySmart-Build-Backend/scripts/staging-smoke.mjs');
  assert.match(script, /method:\s*'GET'/);
  assert.match(script, /API root\/version/);
  assert.match(script, /readiness\/schema checks/);
  assert.match(script, /Supabase connectivity/);
  assert.match(script, /data\?\.ready === true/);
  assert.match(script, /data\?\.connected === true/);
  assert.doesNotMatch(script, /method:\s*'(POST|PUT|PATCH|DELETE)'/);
  assert.match(script, /remote staging URLs/);
});

test('v12 staging smoke check is exposed as a package script and fails closed without URL', () => {
  const pkg = JSON.parse(read('HySmart-Build-Backend/package.json'));
  const script = read('HySmart-Build-Backend/scripts/staging-smoke.mjs');
  assert.equal(pkg.scripts['smoke:staging'], 'node scripts/staging-smoke.mjs');
  assert.match(script, /if \(!rawBase\)/);
  assert.match(script, /process\.exit\(2\)/);
  assert.match(script, /STAGING SMOKE: NO-GO/);
});
