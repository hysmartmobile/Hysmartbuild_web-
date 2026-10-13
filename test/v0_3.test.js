import test from "node:test";
import assert from "node:assert/strict";
import { createAuthorizationMiddleware } from "../src/middleware/authorize.js";
import { RbacService } from "../src/services/rbacService.js";

function responseRecorder() {
  return {
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test("authorization middleware denies a user without the required permission", async () => {
  const rbacService = { getAuthorization: async () => ({ company_id: "c1", user_id: "u1", role: "WORKER", permissions: ["report:read"] }) };
  const authorize = createAuthorizationMiddleware({ rbacService });
  const req = { user: { id: "u1" }, params: { companyId: "c1" } };
  const res = responseRecorder();
  await authorize("expense:approve")(req, res, () => { throw new Error("next should not run"); });
  assert.equal(res.code, 403);
  assert.equal(res.body.error.code, "FORBIDDEN");
});

test("authorization middleware attaches tenant-bound authorization context", async () => {
  const authorization = { company_id: "c1", user_id: "u1", role: "ACCOUNTANT", permissions: ["expense:read"] };
  const rbacService = { getAuthorization: async (args) => { assert.deepEqual(args, { userId: "u1", companyId: "c1" }); return authorization; } };
  const authorize = createAuthorizationMiddleware({ rbacService });
  const req = { user: { id: "u1" }, params: { companyId: "c1" } };
  let called = false;
  await authorize("expense:read")(req, responseRecorder(), () => { called = true; });
  assert.equal(called, true);
  assert.deepEqual(req.authorization, authorization);
});

test("company admin cannot assign company owner", async () => {
  const service = new RbacService({ supabase: {} });
  service.getMembership = async ({ userId }) => userId === "actor"
    ? { company_id: "c1", user_id: "actor", role: "COMPANY_ADMIN", status: "ACTIVE" }
    : { company_id: "c1", user_id: "target", role: "WORKER", status: "ACTIVE" };
  await assert.rejects(
    service.updateMemberRole({ actorUserId: "actor", companyId: "c1", targetUserId: "target", role: "COMPANY_OWNER" }),
    (error) => error.code === "ROLE_ASSIGNMENT_FORBIDDEN" && error.status === 403
  );
});

test("company role flow cannot assign SUPER_ADMIN", async () => {
  const service = new RbacService({ supabase: {} });
  service.getMembership = async () => ({ company_id: "c1", user_id: "actor", role: "COMPANY_OWNER", status: "ACTIVE" });
  await assert.rejects(
    service.updateMemberRole({ actorUserId: "actor", companyId: "c1", targetUserId: "target", role: "SUPER_ADMIN" }),
    (error) => error.code === "ROLE_ASSIGNMENT_FORBIDDEN"
  );
});

test("a company must retain an active owner", async () => {
  const chain = () => ({
    select() { return this; },
    eq() { return this; },
    maybeSingle: async () => ({ data: { id: "m1", company_id: "c1", user_id: "owner", role: "COMPANY_OWNER", status: "ACTIVE" }, error: null }),
    update() { return this; },
    single: async () => ({ data: null, error: null })
  });
  const supabase = { from(table) {
    if (table === "company_members") return chain();
    throw new Error("unexpected table");
  } };
  const service = new RbacService({ supabase });
  service.getMembership = async ({ userId }) => userId === "actor"
    ? { company_id: "c1", user_id: "actor", role: "COMPANY_OWNER", status: "ACTIVE" }
    : { company_id: "c1", user_id: "owner", role: "COMPANY_OWNER", status: "ACTIVE" };
  await assert.rejects(
    service.updateMemberRole({ actorUserId: "actor", companyId: "c1", targetUserId: "owner", role: "COMPANY_ADMIN" }),
    (error) => error.code === "LAST_OWNER_PROTECTED"
  );
});
