import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryRateLimiter } from "../src/middleware/rateLimiter.js";
import { createAuthMiddleware } from "../src/middleware/auth.js";
import { CompanyService } from "../src/services/companyService.js";

test("in-memory rate limiter blocks after configured limit", () => {
  const limiter = new InMemoryRateLimiter({ windowMs: 60_000, max: 2 });
  assert.equal(limiter.check("u").allowed, true);
  assert.equal(limiter.check("u").allowed, true);
  assert.equal(limiter.check("u").allowed, false);
  assert.equal(limiter.check("other").allowed, true);
});

test("auth middleware rejects missing bearer token", async () => {
  const middleware = createAuthMiddleware({ supabase: { auth: { getUser: async () => ({ data: { user: null }, error: null }) } } });
  const result = await new Promise((resolve) => middleware({ headers: {}, ip: "test" }, { status(code) { return { json(body) { resolve({ code, body }); } }; } }, () => resolve({ called: true })));
  assert.equal(result.code, 401);
  assert.equal(result.body.error.code, "UNAUTHENTICATED");
});

test("auth middleware attaches verified Supabase user", async () => {
  const user = { id: "user-1", email: "user@example.com" };
  const middleware = createAuthMiddleware({ supabase: { auth: { getUser: async (token) => ({ data: { user }, error: token !== "valid" ? new Error("bad") : null }) } } });
  const req = { headers: { authorization: "Bearer valid" } };
  let attached;
  await new Promise((resolve, reject) => middleware(req, { status: () => ({ json: reject }) }, () => { attached = req.user; resolve(); }));
  assert.deepEqual(attached, user);
});

test("company creation never accepts a client-selected membership user", async () => {
  const calls = [];
  const supabase = {
    from(table) {
      calls.push(["from", table]);
      const chain = {
        select() { return this; },
        eq() { return this; },
        maybeSingle: async () => table === 'billing_countries' ? ({ data: { country_code:'NG',currency_code:'NGN',locale:'en-NG',timezone:'Africa/Lagos',unit_system:'METRIC',active:true }, error:null }) : ({ data: null, error: null }),
        insert(row) {
          calls.push(["insert", table, row]);
          if (table === "companies") return { select() { return { single: async () => ({ data: { id: "company-1", name: row.name }, error: null }) }; } };
          return Promise.resolve({ error: null });
        },
        delete() { return { eq: async () => ({ error: null }) }; }
      };
      return chain;
    }
  };
  const service = new CompanyService({ supabase });
  await service.createCompany({ userId: "user-1", name: "Build Co", countryCode: "NG" });
  const companyInsert = calls.find((entry) => entry[0] === "insert" && entry[1] === "companies");
  assert.equal(companyInsert[2].created_by, "user-1");
  assert.equal(companyInsert[2].companyId, undefined);
});
