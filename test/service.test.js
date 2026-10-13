import test from "node:test";
import assert from "node:assert/strict";
import { AppService } from "../src/service.js";

test("AppService returns API health metadata", () => {
  const service = new AppService({ supabase: null });
  const health = service.getHealth();

  assert.equal(health.status, "ok");
  assert.equal(health.service, "hysmart-build-api");
  assert.equal(health.version, "5.12.0");
  assert.match(health.timestamp, /^\d{4}-\d{2}-\d{2}T/);
});

test("AppService reports Supabase connectivity success", async () => {
  const supabase = {
    from() {
      return {
        select() {
          return {
            limit: async () => ({ error: null })
          };
        }
      };
    }
  };

  const service = new AppService({ supabase });
  const result = await service.checkSupabase();

  assert.equal(result.connected, true);
  assert.equal(typeof result.latencyMs, "number");
});

test("AppService reports Supabase errors without throwing", async () => {
  const supabase = {
    from() {
      return {
        select() {
          return {
            limit: async () => ({ error: { message: "relation does not exist" } })
          };
        }
      };
    }
  };

  const service = new AppService({ supabase });
  const result = await service.checkSupabase();

  assert.equal(result.connected, false);
  assert.equal(result.error, "relation does not exist");
});
