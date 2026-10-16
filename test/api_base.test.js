import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveApiBase } from '../src/lib/apiBase.js';

test('normalizes the deployed backend origin and tolerates a supplied /api/v1 suffix', () => {
  assert.deepEqual(resolveApiBase('https://hysmart-build.onrender.com', { isProd: true }), { base: 'https://hysmart-build.onrender.com', error: null });
  assert.deepEqual(resolveApiBase('https://hysmart-build.onrender.com/api/v1', { isProd: true }), { base: 'https://hysmart-build.onrender.com', error: null });
});
test('rejects comma-separated API URLs that produce malformed requests', () => {
  assert.match(resolveApiBase('https://hysmart-build.onrender.com,http://localhost:3001', { isProd: true }).error, /exactly one backend URL/);
});
test('rejects localhost and HTTP in production', () => {
  assert.match(resolveApiBase('http://localhost:3001', { isProd: true }).error, /HTTPS/);
  assert.match(resolveApiBase('https://localhost:3001', { isProd: true }).error, /not localhost/);
});
test('uses localhost only as the development default and requires a production value', () => {
  assert.equal(resolveApiBase('', { isDev: true }).base, 'http://localhost:3001');
  assert.match(resolveApiBase('', { isProd: true }).error, /missing/);
});
