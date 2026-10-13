import test from "node:test";
import assert from "node:assert/strict";
import { BillingService } from "../src/services/billingService.js";

test("Paystack is not offered for USD subscription plans", () => {
  const service = Object.create(BillingService.prototype);
  assert.equal(service.supportsSubscriptionCurrency("PAYSTACK", "USD"), false);
});

test("existing Paystack NGN subscriptions remain supported", () => {
  const service = Object.create(BillingService.prototype);
  assert.equal(service.supportsSubscriptionCurrency("PAYSTACK", "NGN"), true);
});

test("Stripe and Flutterwave USD routes are not blocked by the Paystack-specific rule", () => {
  const service = Object.create(BillingService.prototype);
  assert.equal(service.supportsSubscriptionCurrency("STRIPE", "USD"), true);
  assert.equal(service.supportsSubscriptionCurrency("FLUTTERWAVE", "USD"), true);
});

test("Paystack is restricted to Nigeria and NGN", () => {
  const service = Object.create(BillingService.prototype);
  assert.equal(service.supportsProviderRoute("PAYSTACK", "NG", "NGN"), true);
  assert.equal(service.supportsProviderRoute("PAYSTACK", "NG", "USD"), false);
  assert.equal(service.supportsProviderRoute("PAYSTACK", "US", "NGN"), false);
});

test("Stripe is restricted to USD outside Nigeria", () => {
  const service = Object.create(BillingService.prototype);
  assert.equal(service.supportsProviderRoute("STRIPE", "US", "USD"), true);
  assert.equal(service.supportsProviderRoute("STRIPE", "GB", "USD"), true);
  assert.equal(service.supportsProviderRoute("STRIPE", "NG", "USD"), false);
  assert.equal(service.supportsProviderRoute("STRIPE", "US", "NGN"), false);
});

test("Flutterwave remains available for explicitly enabled supported-currency routes", () => {
  const service = Object.create(BillingService.prototype);
  assert.equal(service.supportsProviderRoute("FLUTTERWAVE", "NG", "NGN"), true);
  assert.equal(service.supportsProviderRoute("FLUTTERWAVE", "GH", "GHS"), true);
});
