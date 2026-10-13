import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);

test("V1.6.4 scopes platform-admin middleware to /admin only", () => {
  const source = fs.readFileSync(path.join(root, "src/routes/admin.js"), "utf8");
  assert.match(source, /r\.use\("\/admin", admin\)/);
  assert.doesNotMatch(source, /r\.use\(admin\)/);
});

test("V1.6.4 explicitly repairs suppliers company/id uniqueness before tenant FKs", () => {
  const source = fs.readFileSync(path.join(root, "supabase/migrations/20261003190000_v1_6_3_production_schema_repair.sql"), "utf8");
  assert.match(source, /'suppliers'/);
  assert.match(source, /unique\(company_id,id\)/);
  assert.match(source, /purchase_orders_supplier_tenant_fk/);
  assert.match(source, /references public\.suppliers\(company_id,id\)/);
});
