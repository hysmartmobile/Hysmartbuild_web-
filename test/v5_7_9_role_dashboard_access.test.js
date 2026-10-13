import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("RC14 defines the additional construction roles in the server RBAC catalog", () => {
  const rbac = read("../src/rbac.js");
  for (const role of ["CEO", "CIVIL_ENGINEER", "MANAGEMENT", "COMMERCIAL_MANAGER", "QUANTITY_SURVEYOR", "PROCUREMENT_OFFICER"]) assert.ok(rbac.includes(role));
});

test("RC14 migration expands membership, role permission and invitation role constraints", () => {
  const sql = read("../supabase/migrations/20261009190000_v5_7_9_rc14_role_dashboard_access.sql");
  for (const item of ["company_members_role_check", "role_permissions_role_check", "company_invitations_role_check", "CEO", "CIVIL_ENGINEER", "MANAGEMENT", "COMMERCIAL_MANAGER", "QUANTITY_SURVEYOR", "PROCUREMENT_OFFICER", "dashboard:finance", "dashboard:field", "boq:read"]) assert.ok(sql.includes(item), `missing ${item}`);
  assert.match(sql, /on conflict do nothing/i);
});

test("RC14 server redacts money and company audit details from non-finance intelligence", () => {
  const service = read("../src/services/operatingSystemService.js");
  assert.ok(service.includes("_redactIntelligence"));
  assert.match(service, /if\(finance\)return data/);
  assert.match(service, /moneyLeak:financeRoles\.includes\(role\)\?moneyLeak:null/);
  assert.match(service, /visibleMemory=executiveRoles\.includes\(role\)\?companyMemory/);
  assert.match(service, /canRefreshIntelligence:executiveRoles\.includes\(role\)/);
});

test("RC14 finance-only endpoints require finance/BOQ permissions", () => {
  const routes = read("../src/routes/operatingSystem.js");
  assert.match(routes, /money-leak',authorize\('dashboard:finance'\)/);
  assert.match(routes, /boq-intelligence',authorize\('boq:read'\)/);
  assert.match(routes, /boq\/:itemId',authorize\('boq:read'\)/);
  assert.match(routes, /today\/intelligence\/refresh',authorize\('workflow:execute'\)/);
  assert.match(routes, /today\/intelligence\/:snapshotId\/outcome',authorize\('workflow:execute'\)/);
  const companyRoutes = read('../src/routes/companies.js');
  assert.match(companyRoutes, /z\.enum\(ROLES\.filter/);
  const rbacRoutes = read('../src/routes/rbac.js');
  assert.match(rbacRoutes, /!\[\"SUPER_ADMIN\", \"COMPANY_OWNER\"\]\.includes\(role\)/);
});

test("RC14 frontend fails closed while permissions are loading or unavailable", () => {
  const layout = read("../../HySmart-Build-Web/src/components/Layout.jsx");
  assert.ok(layout.includes("Loading company permissions"));
  assert.ok(layout.includes("Workspace access could not be verified"));
  assert.ok(layout.includes("permissions.has(permission)"));
});

test("RC14 dashboard hides financial and workforce widgets outside their role scopes", () => {
  const today = read("../../HySmart-Build-Web/src/pages/Today.jsx");
  assert.ok(today.includes("finance&&<Stat icon={Wallet}"));
  assert.ok(today.includes("workforce&&<Stat icon={HardHat}"));
  assert.ok(today.includes("{finance&&<Card><div className=\"cardtitle\"><div><h3>Money Leak Detector"));
});
