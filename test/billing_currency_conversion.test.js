import test from 'node:test';
import assert from 'node:assert/strict';
import { BillingService } from '../src/services/billingService.js';

test('currency conversion uses USD reference rates to convert source to target', async () => {
  const service = new BillingService({
    supabase: {}, paystack: {}, flutterwave: {}, stripe: {}, callbackUrl: '',
    exchangeRateFetcher: async () => ({ USD: 1, NGN: 1500, EUR: 0.9, JPY: 150 }),
  });
  const converted = await service.convertAmount(10, 'USD', 'EUR');
  assert.equal(converted.amount, 9);
  assert.equal(converted.rate, 0.9);
  assert.ok(converted.fetchedAt);
});

test('same-currency pricing does not require a live exchange-rate request', async () => {
  let calls = 0;
  const service = new BillingService({
    supabase: {}, paystack: {}, flutterwave: {}, stripe: {}, callbackUrl: '',
    exchangeRateFetcher: async () => { calls += 1; throw new Error('should not be called'); },
  });
  const converted = await service.convertAmount(1250, 'NGN', 'NGN');
  assert.equal(converted.amount, 1250);
  assert.equal(converted.rate, 1);
  assert.equal(calls, 0);
});

test('zero-decimal currencies are rounded to whole units', async () => {
  const service = new BillingService({
    supabase: {}, paystack: {}, flutterwave: {}, stripe: {}, callbackUrl: '',
    exchangeRateFetcher: async () => ({ USD: 1, EUR: 0.9, JPY: 150 }),
  });
  const converted = await service.convertAmount(1.25, 'EUR', 'JPY');
  assert.equal(converted.amount, 208);
});
