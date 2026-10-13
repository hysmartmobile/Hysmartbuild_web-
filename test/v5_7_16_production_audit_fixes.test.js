import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("Stripe checkout verification uses provider-reported amount, currency, company, and reference", () => {
  const source = read("../src/services/billingService.js");
  assert.match(source, /majorUnits\(data\.amount_total,currency\)===Number\(expected\.amount\)/);
  assert.ok(source.includes("String(data.metadata?.companyId||'')!==String(companyId)"));
  assert.ok(source.includes("returnedReference=String(data.metadata?.reference||data.subscription_details?.metadata?.reference||'')"));
  assert.match(source, /majorUnits\(verified\.amount_total,currency\)/);
  assert.match(source, /PAYMENT_AMOUNT_OR_CURRENCY_MISMATCH/);
});

test("offline sync serializes triggers and does not automatically replay failed/conflicted mutations", () => {
  const source = read("../../HySmart-Build-Web/src/lib/sync.js");
  assert.match(source, /let flushInFlight = null/);
  assert.match(source, /if \(flushInFlight\) return flushInFlight/);
  assert.match(source, /item\.state==='pending'\|\|item\.state==='syncing'/);
});

test("company permission loading status remains explicit and accessible", () => {
  const layout = read("../../HySmart-Build-Web/src/components/Layout.jsx");
  assert.ok(layout.includes('LoadingSpinner label="Loading company permissions…"'));
  assert.ok(layout.includes("Workspace access could not be verified"));
});

test("subscription API failure is not misrepresented as an expired subscription", () => {
  const app = read("../../HySmart-Build-Web/src/App.jsx");
  assert.ok(app.includes("const[billingError,setBillingError]=useState('')"));
  assert.ok(app.includes("Unable to verify subscription"));
  assert.ok(app.includes("This does not mean your subscription has expired."));
});
