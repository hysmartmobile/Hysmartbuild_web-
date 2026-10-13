import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { requestId } from '../src/middleware/requestId.js';
import { errorHandler } from '../src/middleware/errorHandler.js';

function invokeRequestId(value) {
  const headers = {};
  const req = { header: (name) => name.toLowerCase() === 'x-request-id' ? value : undefined };
  const res = { setHeader: (name, content) => { headers[name] = content; } };
  let called = false;
  requestId(req, res, () => { called = true; });
  return { req, headers, called };
}

test('v13 request IDs accept bounded safe correlation IDs', () => {
  const result = invokeRequestId('release_13-abc.42');
  assert.equal(result.req.requestId, 'release_13-abc.42');
  assert.equal(result.headers['x-request-id'], 'release_13-abc.42');
  assert.equal(result.called, true);
});

test('v13 request IDs replace control characters and oversized client values', () => {
  for (const value of ['bad\r\nInjected: yes', 'x'.repeat(81), '']) {
    const result = invokeRequestId(value);
    assert.match(result.req.requestId, /^[0-9a-f-]{36}$/i);
    assert.equal(result.headers['x-request-id'], result.req.requestId);
  }
});

test('v13 error logs omit query parameters that can contain invitation tokens', () => {
  const originalError = console.error;
  const originalNodeEnv = process.env.NODE_ENV;
  let record;
  try {
    process.env.NODE_ENV = 'production';
    console.error = (value) => { record = JSON.parse(value); };
    const response = { statusCode: null, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    errorHandler(new Error('database failure'), { requestId: 'safe-id', method: 'GET', path: '/api/v1/invitations/accept', originalUrl: '/api/v1/invitations/accept?token=secret-token' }, response, () => {});
    assert.equal(record.path, '/api/v1/invitations/accept');
    assert.equal(JSON.stringify(record).includes('secret-token'), false);
    assert.equal(response.statusCode, 500);
    assert.equal(response.body.error.message, 'An unexpected error occurred');
  } finally {
    console.error = originalError;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  }
});

test('v13 production configuration requires HTTPS public origins and callback URLs', () => {
  const source = fs.readFileSync(new URL('../src/config/env.js', import.meta.url), 'utf8');
  assert.match(source, /Production CORS_ORIGIN entries must be valid HTTPS origins/);
  assert.match(source, /Production WEB_APP_URL must use HTTPS/);
  assert.match(source, /Production BILLING_CALLBACK_URL must use HTTPS/);
});

test('v13 request ID middleware does not trust arbitrary client text', () => {
  const source = fs.readFileSync(new URL('../src/middleware/requestId.js', import.meta.url), 'utf8');
  assert.match(source, /SAFE_REQUEST_ID/);
  assert.match(source, /A-Za-z0-9\._-/);
  assert.match(source, /1,80/);
  assert.match(source, /randomUUID\(\)/);
});
