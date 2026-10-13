import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const service = fs.readFileSync(new URL('../src/services/billingService.js', import.meta.url), 'utf8');
const routes = fs.readFileSync(new URL('../src/routes/billing.js', import.meta.url), 'utf8');
const ui = fs.readFileSync(new URL('../../HySmart-Build-Web/src/pages/Billing.jsx', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('../../HySmart-Build-Web/src/lib/api.js', import.meta.url), 'utf8');

test('provider routing reads the existing enabled flag, not a nonexistent active flag', () => {
  assert.match(service, /payment_provider_routes[\s\S]*?\.eq\("enabled",true\)/);
  assert.doesNotMatch(service.match(/async routeProvider\([\s\S]*?\n  async ensureProviderPlan/)?.[0] || '', /\.eq\("active",true\)/);
});

test('billing exposes enabled payment gateways by billing country', () => {
  assert.match(service, /async providers\(\{countryCode\}\)/);
  assert.match(routes, /\/billing\/providers/);
  assert.match(api, /billingProviders:\(countryCode\)=>call\(`\/billing\/providers/);
});

test('billing UI persists selected billing country and sends the selected provider to checkout', () => {
  assert.match(ui, /api\.updateCompany\(\{[\s\S]*?billingCountryCode: nextCountry/);
  assert.match(ui, /provider: requestedProvider/);
  assert.match(ui, /Payment gateway/);
});


test('checkout routing falls back from an incompatible explicitly requested provider to an enabled compatible route', () => {
  const routeMethod = service.match(/async routeProvider\([\s\S]*?\n  async ensureProviderPlan/)?.[0] || '';
  assert.match(routeMethod, /const available = \(routes \|\| \[\]\)\.filter/);
  assert.match(routeMethod, /const fallback = available\[0\]/);
  assert.match(routeMethod, /supportsProviderRoute\(matching\.provider, country, currency\)/);
});

test('provider fallback still requires enabled routes, configured credentials, and country/currency compatibility', () => {
  const routeMethod = service.match(/async routeProvider\([\s\S]*?\n  async ensureProviderPlan/)?.[0] || '';
  assert.match(routeMethod, /\.eq\("enabled", true\)/);
  assert.match(routeMethod, /this\.providerConfigured\(route\.provider\)/);
  assert.match(routeMethod, /this\.supportsProviderRoute\(route\.provider, country, currency\)/);
});
