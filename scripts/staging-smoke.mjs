#!/usr/bin/env node
/**
 * Read-only post-deployment smoke check. It never sends mutations or prints response bodies.
 * Usage: HYSMART_STAGING_URL=https://api.example.com npm run smoke:staging
 */
const rawBase = process.env.HYSMART_STAGING_URL;
const timeoutMs = Number.parseInt(process.env.HYSMART_SMOKE_TIMEOUT_MS || '8000', 10);

if (!rawBase) {
  console.error('FAIL: set HYSMART_STAGING_URL to the deployed API origin.');
  process.exit(2);
}

let base;
try {
  base = new URL(rawBase);
} catch {
  console.error('FAIL: HYSMART_STAGING_URL must be a valid absolute URL.');
  process.exit(2);
}
if (!['http:', 'https:'].includes(base.protocol) || (base.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(base.hostname))) {
  console.error('FAIL: use HTTPS for remote staging URLs (HTTP is allowed only for localhost).');
  process.exit(2);
}
if (!Number.isFinite(timeoutMs) || timeoutMs < 500 || timeoutMs > 60000) {
  console.error('FAIL: HYSMART_SMOKE_TIMEOUT_MS must be between 500 and 60000.');
  process.exit(2);
}

const checks = [
  {
    name: 'API root/version', path: '/',
    validate: (body) => body?.success === true && body?.data?.name === 'HySmart Build API' && body?.data?.version === '5.7.8'
  },
  {
    name: 'health endpoint', path: '/api/v1/health',
    validate: (body) => body?.success === true && body?.data?.status === 'ok' && body?.data?.version === '5.7.8'
  },
  {
    name: 'readiness/schema checks', path: '/api/v1/health/ready',
    validate: (body) => body?.success === true && body?.data?.ready === true
  },
  {
    name: 'Supabase connectivity', path: '/api/v1/health/supabase',
    validate: (body) => body?.success === true && body?.data?.connected === true
  }
];

let failed = false;
for (const check of checks) {
  const target = new URL(check.path, base);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(target, {
      method: 'GET',
      headers: { accept: 'application/json', 'user-agent': 'HySmart-Staging-Smoke/1.0' },
      redirect: 'error',
      signal: controller.signal
    });
    let body;
    try { body = await response.json(); } catch { body = null; }
    const ok = response.status === 200 && check.validate(body);
    console.log(`${ok ? 'PASS' : 'FAIL'} ${check.name} (HTTP ${response.status})`);
    if (!ok) failed = true;
  } catch (error) {
    const reason = error?.name === 'AbortError' ? `timeout after ${timeoutMs}ms` : 'request failed';
    console.log(`FAIL ${check.name} (${reason})`);
    failed = true;
  } finally {
    clearTimeout(timer);
  }
}

if (failed) {
  console.error('STAGING SMOKE: NO-GO. Investigate the failed checks; no changes were made.');
  process.exitCode = 1;
} else {
  console.log('STAGING SMOKE: endpoint checks passed. This is not a complete production approval.');
}
