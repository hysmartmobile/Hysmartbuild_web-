import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("RC24 grants company-wide read visibility to CEO, Director and Management roles", () => {
  const sql = read("../supabase/migrations/20261009223000_v5_7_11_executive_companywide_access.sql");
  for (const role of ["CEO", "DIRECTOR", "MANAGEMENT"]) assert.ok(sql.includes(`('${role}')`));
  assert.match(sql, /p\.key like '%:read'/i);
  for (const key of ["dashboard:executive", "dashboard:finance", "dashboard:workforce", "dashboard:field", "accounting:read", "audit:read", "control-tower:read", "boq:read", "inventory:read"]) assert.ok(sql.includes(key), `missing ${key}`);
  assert.match(sql, /on conflict do nothing/i);
});

test("RC24 does not grant executives unrestricted payment, payroll or company-admin mutation", () => {
  const sql = read("../supabase/migrations/20261009223000_v5_7_11_executive_companywide_access.sql");
  for (const forbidden of ["accounting:manage", "accounting:post", "expense:pay", "procurement:pay", "payroll:approve", "bank:manage", "billing:manage", "company:update", "user:invite", "project:delete"]) {
    assert.doesNotMatch(sql, new RegExp(`['\"]${forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}['\"]`), `${forbidden} must remain separately authorized`);
  }
});

test("RC24 is additive and keeps explicit permission boundaries", () => {
  const sql = read("../supabase/migrations/20261009223000_v5_7_11_executive_companywide_access.sql");
  assert.match(sql, /begin;/i);
  assert.match(sql, /commit;/i);
  assert.match(sql, /on conflict do nothing/i);
  assert.match(sql, /unrestricted/i);
  assert.match(sql, /financial mutation/i);
});
