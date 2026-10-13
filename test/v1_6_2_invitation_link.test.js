import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());
const companyService = fs.readFileSync(path.join(root, "src/services/companyService.js"), "utf8");
const companyRoute = fs.readFileSync(path.join(root, "src/routes/companies.js"), "utf8");

test("invitation creation returns a secure shareable URL without an email provider", () => {
  assert.match(companyService, /createInvitation/);
  assert.match(companyService, /createHash\('sha256'\)/);
  assert.match(companyService, /inviteUrl/);
  assert.match(companyService, /webAppUrl.*invitations\/accept/);
  assert.doesNotMatch(companyService, /emailService|RESEND|sendCompanyInvitation/);
});

test("invitation preview remains public and acceptance remains authenticated", () => {
  const preview = companyRoute.indexOf('router.get("/invitations/preview"');
  const auth = companyRoute.indexOf("router.use(authMiddleware)");
  assert.ok(preview >= 0 && auth >= 0 && preview < auth);
  assert.match(companyRoute, /router.post\("\/invitations\/accept"/);
});
