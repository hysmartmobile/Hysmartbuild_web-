import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(backendRoot, 'scripts', 'staging-smoke.mjs');
const payloads = new Map([
  ['/', { success: true, data: { name: 'HySmart Build API', version: '5.12.0' } }],
  ['/api/v1/health', { success: true, data: { status: 'ok', version: '5.12.0' } }],
  ['/api/v1/health/ready', { success: true, data: { ready: true } }],
  ['/api/v1/health/supabase', { success: true, data: { connected: true } }]
]);

function runSmoke(url) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      env: { ...process.env, HYSMART_STAGING_URL: url, HYSMART_SMOKE_TIMEOUT_MS: '1500' },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', status => resolve({ status, stdout, stderr }));
  });
}

async function withServer(handler, callback) {
  const server = createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try { await callback(`http://127.0.0.1:${port}`); }
  finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

test('staging smoke passes against a local server with all expected health payloads', async () => {
  await withServer((req, res) => {
    const body = payloads.get(req.url);
    res.writeHead(body ? 200 : 404, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body ?? { success: false }));
  }, async url => {
    const result = await runSmoke(url);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal((result.stdout.match(/PASS /g) ?? []).length, 4);
    assert.match(result.stdout, /endpoint checks passed/);
  });
});

test('staging smoke fails when readiness reports not ready, without printing response body', async () => {
  await withServer((req, res) => {
    const body = req.url === '/api/v1/health/ready'
      ? { success: true, data: { ready: false, secret: 'must-not-leak' } }
      : payloads.get(req.url);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  }, async url => {
    const result = await runSmoke(url);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /FAIL readiness\/schema checks/);
    assert.match(result.stderr, /STAGING SMOKE: NO-GO/);
    assert.doesNotMatch(result.stdout + result.stderr, /must-not-leak/);
  });
});

test('staging smoke rejects redirects rather than following them', async () => {
  await withServer((req, res) => {
    res.writeHead(302, { location: '/redirect-target' });
    res.end();
  }, async url => {
    const result = await runSmoke(url);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /FAIL API root\/version/);
    assert.match(result.stderr, /STAGING SMOKE: NO-GO/);
  });
});
