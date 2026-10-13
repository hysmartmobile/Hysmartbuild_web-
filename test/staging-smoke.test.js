import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(backendRoot, 'scripts', 'staging-smoke.mjs');
const cleanEnv = () => {
  const env = { ...process.env };
  delete env.HYSMART_STAGING_URL;
  delete env.HYSMART_SMOKE_TIMEOUT_MS;
  return env;
};
const runSmoke = (url, timeout) => {
  const env = cleanEnv();
  if (url !== undefined) env.HYSMART_STAGING_URL = url;
  if (timeout !== undefined) env.HYSMART_SMOKE_TIMEOUT_MS = String(timeout);
  return spawnSync(process.execPath, [script], { env, encoding: 'utf8', timeout: 3000 });
};

test('staging smoke check fails closed when the target URL is missing', () => {
  const result = runSmoke();
  assert.equal(result.status, 2);
  assert.match(result.stderr, /set HYSMART_STAGING_URL/);
  assert.doesNotMatch(result.stdout + result.stderr, /PASS /);
});

test('staging smoke check rejects remote plaintext HTTP before making requests', () => {
  const result = runSmoke('http://staging.example.test');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /use HTTPS for remote staging URLs/);
  assert.doesNotMatch(result.stdout + result.stderr, /PASS |STAGING SMOKE:/);
});

test('staging smoke check rejects invalid timeout values before making requests', () => {
  const result = runSmoke('https://staging.example.test', 100000);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /HYSMART_SMOKE_TIMEOUT_MS must be between 500 and 60000/);
  assert.doesNotMatch(result.stdout + result.stderr, /PASS |STAGING SMOKE:/);
});

test('staging smoke check only defines read-only GET probes and does not print response bodies', async () => {
  const source = await (await import('node:fs/promises')).readFile(script, 'utf8');
  assert.match(source, /method: 'GET'/);
  assert.match(source, /redirect: 'error'/);
  assert.match(source, /read-only post-deployment smoke check/i);
  assert.doesNotMatch(source, /console\.(?:log|error)\([^\n]*(?:JSON\.stringify\(body\)|body\.message|body\.error)/);
});
