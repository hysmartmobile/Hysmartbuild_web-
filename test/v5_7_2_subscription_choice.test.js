import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("../", import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), "utf8");
const migration = read("supabase/migrations/20261009150000_v5_7_2_explicit_subscription_choice.sql");
const billingService = read("src/services/billingService.js");
const billingRoute = read("src/routes/billing.js");
const authorization = read("src/middleware/authorize.js");
const webApp = read("../HySmart-Build-Web/src/App.jsx");
const onboarding = read("../HySmart-Build-Web/src/pages/CompanyOnboarding.jsx");
const billingPage = read("../HySmart-Build-Web/src/pages/Billing.jsx");

test("new companies no longer receive an automatic trial from either legacy trigger", () => {
  assert.match(migration, /drop trigger if exists companies_provision_trial/);
  assert.match(migration, /drop trigger if exists companies_initialize_subscription/);
  assert.doesNotMatch(migration, /insert into public\.company_subscriptions/i);
});

test("trial is explicitly started by the owner and lasts exactly 14 days", () => {
  assert.match(billingService, /async startTrial\(\{ companyId, userId \}\)/);
  assert.match(billingService, /membership\.role !== \"COMPANY_OWNER\"/);
  assert.match(billingService, /14 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(billingRoute, /billing\/trial/);
});

test("workspace is gated when there is no subscription or the subscription has expired", () => {
  assert.match(webApp, /!subscription/);
  assert.match(webApp, /EXPIRED/);
  assert.match(authorization, /SUBSCRIPTION_REQUIRED/);
  assert.match(authorization, /trialExpired/);
});

test("company creation redirects to billing and billing offers an explicit free trial", () => {
  assert.match(onboarding, /navigate\('\/billing'/);
  assert.match(billingPage, /Start 14-day free trial/);
  assert.match(billingPage, /Upgrade \/ renew/);
});

import { createAuthorizationMiddleware } from "../src/middleware/authorize.js";

function responseRecorder() {
  return { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
}

test("API authorization blocks dashboard access when no subscription exists", async () => {
  const authorize = createAuthorizationMiddleware({ rbacService: {
    getAuthorization: async () => ({ permissions: ["project:read"] }),
    getSubscriptionStatus: async () => null,
  } });
  const req = { user: { id: "u1" }, params: { companyId: "c1" } };
  const res = responseRecorder();
  let nextCalled = false;
  await authorize("project:read")(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.code, 402);
  assert.equal(res.body.error.code, "SUBSCRIPTION_REQUIRED");
});

test("API authorization blocks an expired trial but leaves billing reachable", async () => {
  const authorize = createAuthorizationMiddleware({ rbacService: {
    getAuthorization: async () => ({ permissions: ["project:read", "billing:read"] }),
    getSubscriptionStatus: async () => ({ status: "TRIAL", trial_ends_at: "2020-01-01T00:00:00.000Z" }),
  } });
  const req = { user: { id: "u1" }, params: { companyId: "c1" } };
  const blocked = responseRecorder();
  await authorize("project:read")(req, blocked, () => {});
  assert.equal(blocked.code, 402);
  const billing = responseRecorder();
  let billingNext = false;
  await authorize("billing:read")(req, billing, () => { billingNext = true; });
  assert.equal(billingNext, true);
});

test("subscription enforcement is company-wide and does not depend on member role", async () => {
  for (const role of ["COMPANY_OWNER", "COMPANY_ADMIN", "SITE_ENGINEER", "ACCOUNTANT", "WORKER"]) {
    const authorize = createAuthorizationMiddleware({ rbacService: {
      getAuthorization: async () => ({ role, permissions: ["project:read"] }),
      getSubscriptionStatus: async () => ({ status: "TRIAL", trial_ends_at: "2020-01-01T00:00:00.000Z" }),
    } });
    const res = responseRecorder();
    let nextCalled = false;
    await authorize("project:read")({ user: { id: `u-${role}` }, params: { companyId: "company-1" } }, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false, `${role} must be blocked when the company trial expires`);
    assert.equal(res.code, 402);
    assert.equal(res.body.error.code, "SUBSCRIPTION_REQUIRED");
  }
});

test("valid company renewal restores workspace access for every role without changing role permissions", async () => {
  for (const role of ["COMPANY_OWNER", "COMPANY_ADMIN", "SITE_ENGINEER", "ACCOUNTANT", "WORKER"]) {
    const originalPermissions = ["project:read"];
    const authorize = createAuthorizationMiddleware({ rbacService: {
      getAuthorization: async () => ({ role, permissions: originalPermissions }),
      getSubscriptionStatus: async () => ({ status: "ACTIVE", current_period_end: "2099-01-01T00:00:00.000Z" }),
    } });
    const res = responseRecorder();
    let nextCalled = false;
    await authorize("project:read")({ user: { id: `u-${role}` }, params: { companyId: "company-1" } }, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true, `${role} should regain workspace access after company renewal`);
    assert.deepEqual(originalPermissions, ["project:read"]);
  }
});

test("only company owner can initiate or verify billing changes; non-owners receive a safe billing-status endpoint", () => {
  assert.match(billingService, /async assertCompanyOwner\(\{ companyId, userId \}\)/);
  assert.match(billingService, /Only the company creator\/owner can upgrade, renew, start a trial, or change the subscription/);
  assert.match(billingService, /async memberStatus\(\{ companyId, userId \}\)/);
  assert.match(billingRoute, /billing\/status/);
  assert.match(billingRoute, /userId:\s*req\.user\.id/);
  assert.match(billingService, /async checkout\(\{companyId,userId,email,name,phone,planCode,billingInterval,providerName\}\)\{await this\.assertCompanyOwner/);
  assert.match(billingService, /async verify\(\{companyId,userId,providerName,reference,transactionId,sessionId\}\)\{await this\.assertCompanyOwner/);
});
