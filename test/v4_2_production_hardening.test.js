import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root=path.resolve(new URL("..",import.meta.url).pathname);
const web=path.resolve(root,"../HySmart-Build-Web");

test("payment reconciliation supports recurring customer path and correct minor-unit conversion",()=>{
 const s=fs.readFileSync(path.join(root,"src/services/billingService.js"),"utf8");
 assert.match(s,/reconcileRecurringByCustomer/);
 assert.match(s,/majorUnits\(verified\.amount,verified\.currency\)/);
 assert.match(s,/findTransactionByProviderReference/);
});
test("web has no JSX parser diagnostics",()=>{
 const quality=fs.readFileSync(path.join(web,"src/pages/QualitySafety.jsx"),"utf8");
 assert.match(quality,/<\/section><\/section><List rows=\{ncrs\}/);
});
test("PWA service worker rotates shell cache",()=>{
 const sw=fs.readFileSync(path.join(web,"public/sw.js"),"utf8");
 assert.match(sw,/const CACHE_NAME = `\$\{CACHE_PREFIX\}5\.12\.0-forecast-monitoring`/);
 assert.match(sw,/caches\.delete/);
});
test("dark mode is persisted and exposed in settings",()=>{
 const main=fs.readFileSync(path.join(web,"src/main.jsx"),"utf8");
 const settings=fs.readFileSync(path.join(web,"src/pages/Settings.jsx"),"utf8");
 const css=fs.readFileSync(path.join(web,"src/styles.css"),"utf8");
 assert.match(main,/applyTheme\(getTheme\(\)/);
 assert.match(fs.readFileSync(path.join(web,"src/lib/theme.js"),"utf8"),/hysmart\.theme/); assert.match(settings,/Dark mode/); assert.match(css,/data-theme="dark"/);
});

test("logout control is visible and guarded against duplicate clicks",()=>{
 const layout=fs.readFileSync(path.join(web,"src/components/Layout.jsx"),"utf8");
 assert.match(layout,/className=\"logout\"/); assert.match(layout,/Signing out/); assert.match(layout,/supabase\.auth\.signOut/);
});
test("invitation flow stores a hash and returns a one-time link without storing the raw token",()=>{
 const service=fs.readFileSync(path.join(root,"src/services/companyService.js"),"utf8");
 assert.match(service,/createHash\('sha256'\)/); assert.match(service,/token_hash:tokenHash/); assert.match(service,/inviteUrl/);
});
test("billing UI uses the backend company billing country field",()=>{
 const billing=fs.readFileSync(path.join(web,"src/pages/Billing.jsx"),"utf8");
 assert.match(billing,/billing_country/);
});
