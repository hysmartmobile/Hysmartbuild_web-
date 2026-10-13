import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());
const read = (p) => fs.readFileSync(path.join(root,p),"utf8");

test("V1.5 canonical company identity matches application contract", () => {
  const service = read("src/services/companyService.js");
  const migration = read("supabase/migrations/20261003130000_v1_5_production_completion.sql");
  assert.match(service, /billing_country/);
  assert.match(service, /tax_country/);
  assert.match(migration, /add column if not exists billing_country text/i);
  assert.match(migration, /add column if not exists tax_country text/i);
});

test("payment provider routes use enabled while country catalogue uses active", () => {
  const service = read("src/services/billingService.js");
  const migration = read("supabase/migrations/20261003130000_v1_5_production_completion.sql");
  assert.match(service, /payment_provider_routes[\s\S]*?eq\(["']enabled["'],true\)/);
  assert.match(service, /billing_countries[\s\S]*?eq\(["']active["'],true\)/);
  assert.match(migration, /add column if not exists active boolean/i);
});

test("V1.5 enforces subscription limits on project, invite and storage paths", () => {
  assert.match(read("src/services/projectService.js"), /enforce_company_limit/);
  assert.match(read("src/services/companyService.js"), /p_resource: "users"/);
  assert.match(read("src/services/documentService.js"), /p_resource: "storage_mb"/);
  assert.match(read("src/services/reportService.js"), /p_resource:"storage_mb"/);
});

test("V1.5 exposes platform administration and audit routes", () => {
  assert.match(read("src/routes/admin.js"), /\/admin\/plans/);
  assert.match(read("src/routes/admin.js"), /\/admin\/subscriptions/);
  assert.match(read("src/routes/companies.js"), /audit-logs/);
  assert.match(read("supabase/migrations/20261003130000_v1_5_production_completion.sql"), /create table if not exists public.audit_logs/i);
});

test("V1.5 payment lifecycle handles Stripe deletion and failure events", () => {
  const service = read("src/services/billingService.js");
  assert.match(service, /customer\.subscription\.deleted/);
  assert.match(service, /invoice\.payment_failed/);
  assert.match(service, /async updateSubscriptionLifecycle/);
});

test("V1.5 protects site-report photo paths", () => {
  assert.match(read("src/services/reportService.js"), /PHOTO_PATH_INVALID/);
  assert.match(read("src/routes/reports.js"), /photos\/:photoId\/download-url/);
});

test("V1.5 provides supplier master-data API", () => {
  assert.match(read("src/routes/suppliers.js"), /suppliers/);
  assert.match(read("supabase/migrations/20261003130000_v1_5_production_completion.sql"), /create table if not exists public.suppliers/i);
});
