import test from "node:test";
import assert from "node:assert/strict";
import { AppService } from "../src/service.js";

test("v4.2 health metadata reports current release", () => {
  const service = new AppService({ supabase: { from(){ throw new Error("not called"); } } });
  assert.equal(service.getHealth().version, "5.7.8");
  assert.equal(service.getHealth().status, "ok");
});

test("v4.2 readiness requires Supabase and field schema compatibility", async () => {
  const service = new AppService({ supabase: { from(){ return { select(){ return { limit: async()=>({ error:null }) }; } }; } } });
  const result = await service.checkReadiness();
  assert.equal(result.ready, true);
  assert.equal(result.checks.supabase.connected, true);
  assert.equal(result.checks.schema.attendance_records.ok, true);
  assert.equal(result.checks.schema.daily_site_reports.ok, true);
});

test("v4.2 readiness fails closed when Supabase is unavailable", async () => {
  const service = new AppService({ supabase: { from(){ return { select(){ return { limit: async()=>({ error:{ message:"offline" } }) }; } }; } } });
  const result = await service.checkReadiness();
  assert.equal(result.ready, false);
  assert.equal(result.checks.supabase.connected, false);
});

test("v4.2 health route contract exposes readiness", async () => {
  const source = await import("node:fs/promises").then(fs => fs.readFile(new URL("../src/routes/health.js", import.meta.url), "utf8"));
  assert.match(source, /router\.get\("\/ready"/);
});

test("current release metadata is consistent in the API source", async () => {
  const source = await import("node:fs/promises").then(fs => fs.readFile(new URL("../src/app.js", import.meta.url), "utf8"));
  assert.match(source, /version: "5\.7\.8"/);
});
