import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { CompanyService } from "../src/services/companyService.js";

const read = p => fs.readFile(new URL(`../${p}`, import.meta.url), "utf8");

test("v4.6.0 repair migration restores field GPS columns idempotently", async () => {
  const sql = await read("supabase/migrations/20261005060000_v4_3_2_field_schema_repair.sql");
  for (const column of ["location_latitude", "location_longitude", "location_accuracy_m", "location_verified"]) {
    assert.match(sql, new RegExp(`add column if not exists ${column}`));
  }
  assert.match(sql, /attendance_field_lookup_idx/);
  assert.match(sql, /daily_reports_field_lookup_idx/);
  assert.match(sql, /offline_sync_operations_company_operation_uidx/);
});

test("v4.6.0 readiness exposes schema mismatch instead of allowing broken field endpoints", async () => {
  const { AppService } = await import("../src/service.js");
  const service = new AppService({
    supabase: {
      from(table) {
        return { select() { return { limit: async () => ({ error: table === "daily_site_reports" ? { message: "column daily_site_reports.location_latitude does not exist" } : null }) }; } };
      }
    }
  });
  const result = await service.checkReadiness();
  assert.equal(result.ready, false);
  assert.equal(result.checks.schema.daily_site_reports.code, "SCHEMA_MISMATCH");
  assert.match(result.checks.schema.daily_site_reports.migration, /20261005060000_v4_3_2_field_schema_repair/);
});

test("v4.6.0 invitation preview distinguishes revoked or used invitations", async () => {
  const service = new CompanyService({
    supabase: {
      from() {
        return {
          select() { return { eq() { return { maybeSingle: async () => ({ data: { status: "REVOKED" }, error: null }) }; } }; }
        };
      }
    }
  });
  await assert.rejects(() => service.previewInvitation({ token: "abcdefghijklmnopqrstuvwxyz123456" }), e => {
    assert.equal(e.code, "INVITATION_REVOKED");
    assert.equal(e.status, 400);
    return true;
  });
});

test("v4.6.0 server startup metadata is aligned", async () => {
  const source = await read("src/server.js");
  assert.match(source, /HySmart Build API v5\.12\.0/);
  assert.doesNotMatch(source, /HySmart Build API v2\.2\.0/);
});
