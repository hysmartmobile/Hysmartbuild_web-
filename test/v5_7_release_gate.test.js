import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { InMemoryRateLimiter } from '../src/middleware/rateLimiter.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const backend = path.join(root, 'HySmart-Build-Backend');
const web = path.join(root, 'HySmart-Build-Web');

function read(file) { return fs.readFileSync(file, 'utf8'); }

test('v5.7 rate limiter prunes expired keys and can be destroyed cleanly', async () => {
  const limiter = new InMemoryRateLimiter({ windowMs: 5, max: 1, cleanupIntervalMs: 5 });
  limiter.check('a');
  assert.equal(limiter.entries.size, 1);
  await new Promise(resolve => setTimeout(resolve, 15));
  limiter.cleanup();
  assert.equal(limiter.entries.size, 0);
  limiter.destroy();
  assert.equal(limiter.entries.size, 0);
});

test('v5.7 server has bounded HTTP timeouts and graceful shutdown handlers', () => {
  const source = read(path.join(backend, 'src/server.js'));
  assert.match(source, /server\.keepAliveTimeout\s*=\s*5_000/);
  assert.match(source, /server\.headersTimeout\s*=\s*65_000/);
  assert.match(source, /server\.requestTimeout\s*=\s*60_000/);
  assert.match(source, /process\.once\("SIGTERM"/);
  assert.match(source, /process\.once\("SIGINT"/);
});

test('v5.7 API trusts proxy configuration explicitly instead of implicitly', () => {
  const env = read(path.join(backend, 'src/config/env.js'));
  const app = read(path.join(backend, 'src/app.js'));
  assert.match(env, /TRUST_PROXY/);
  assert.match(env, /trustProxy:/);
  assert.match(app, /app\.set\("trust proxy", env\.trustProxy\)/);
});

test('v5.7 browser API has bounded requests and only retries idempotent GET failures', () => {
  const source = read(path.join(web, 'src/lib/api.js'));
  assert.match(source, /REQUEST_TIMEOUT_MS\s*=\s*30_000/);
  assert.match(source, /AbortController/);
  assert.match(source, /method==='GET'\?2:1/);
  assert.match(source, /status === 502 \|\| status === 503 \|\| status === 504/);
});

test('v5.7 release has no local secret files or temporary editor artifacts', () => {
  const forbidden = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if ((entry.name.startsWith('.env') && entry.name !== '.env.example') || /\.tmp$|\.swp$/.test(entry.name) || entry.name.endsWith('~')) forbidden.push(full);
    }
  };
  walk(backend); walk(web);
  assert.deepEqual(forbidden, []);
});


test('v5.7.8 API health/version surfaces agree with package release version', () => {
  const packageJson = JSON.parse(read(path.join(backend, 'package.json')));
  const app = read(path.join(backend, 'src/app.js'));
  const service = read(path.join(backend, 'src/service.js'));
  assert.equal(packageJson.version, '5.12.0');
  assert.ok(app.includes(`version: "${packageJson.version}"`));
  assert.ok(service.includes(`version: "${packageJson.version}"`));
  assert.doesNotMatch(app, /version: "5\.7\.1"/);
  assert.doesNotMatch(service, /version: "5\.7\.1"/);
});

test('v5.7.8 production app retains baseline HTTP security controls', () => {
  const app = read(path.join(backend, 'src/app.js'));
  const env = read(path.join(backend, 'src/config/env.js'));
  const auth = read(path.join(backend, 'src/middleware/auth.js'));
  assert.match(app, /app\.disable\("x-powered-by"\)/);
  assert.match(app, /app\.use\(helmet\(\)\)/);
  assert.match(app, /allowedOrigins\.has\(origin\)/);
  assert.match(app, /express\.json\(\{ limit: "1mb"/);
  assert.match(env, /Production CORS_ORIGIN must not contain localhost/);
  assert.match(env, /Production WEB_APP_URL must not point to localhost/);
  assert.match(auth, /supabase\.auth\.getUser\(token\)/);
});


test('v5.7 staging smoke guard has safe read-only checks and automated invalid-config coverage', () => {
  const packageJson = JSON.parse(read(path.join(backend, 'package.json')));
  const smoke = read(path.join(backend, 'scripts', 'staging-smoke.mjs'));
  const smokeTests = read(path.join(backend, 'test', 'staging-smoke.test.js'));
  assert.equal(packageJson.scripts['smoke:staging'], 'node scripts/staging-smoke.mjs');
  assert.match(smoke, /method: 'GET'/);
  assert.match(smoke, /redirect: 'error'/);
  assert.match(smoke, /use HTTPS for remote staging URLs/);
  assert.match(smokeTests, /fails closed when the target URL is missing/);
  assert.match(smokeTests, /rejects remote plaintext HTTP/);
});

test('v5.7.8 BOQ commercial suite includes deterministic known-value reconciliation fixtures', () => {
  const source = read(path.join(backend, 'test', 'boq-commercial-calculations.test.js'));
  assert.match(source, /BOQ known-value reconciliation fixture matches commitments, invoiced cost, expenses, forecast and margin/);
  assert.match(source, /BOQ known-value fixture flags linked invoice mirror currency mismatch/);
  assert.match(source, /forecastMargin: 630/);
  assert.match(source, /requiresReview: false/);
});

test('v5.7.8 RC45 includes read-only staging financial schema verification and honest acceptance limits', () => {
  const sql = read(path.join(backend, 'scripts', 'staging-financial-verification.sql'));
  const runbook = read(path.join(backend, 'STAGING-FINANCIAL-VERIFICATION-RC45.md'));
  assert.match(sql, /expenses_supplier_invoice_tenant_fk/);
  assert.match(sql, /supplier_invoices row-level security is enabled/);
  assert.match(sql, /select check_name, case when passed then 'PASS' else 'FAIL' end/);
  assert.doesNotMatch(sql, /\b(insert into|update\s+public\.|delete from|alter table|create index|drop table)\b/i);
  assert.match(runbook, /Do not describe RC45 as live-staging-verified/);
});


test('v5.7.8 BOQ reconciliation guards against duplicate supplier invoice IDs', () => {
  const service = read(path.join(backend, 'src', 'services', 'boqCommercialCalculations.js'));
  const tests = read(path.join(backend, 'test', 'boq-commercial-calculations.test.js'));
  assert.match(service, /duplicateSupplierInvoiceCount/);
  assert.match(service, /countedInvoiceIds\.has\(invoice\.id\)/);
  assert.match(tests, /counts a duplicate supplier invoice ID only once/);
  assert.match(tests, /still counts distinct invoices against the same purchase order/);
});

test('v5.7 release gate: supplier invoice item costing migration and API are covered', () => {
  const migration = read(path.join(backend, 'supabase/migrations/20261010120000_v1_11_supplier_invoice_items.sql'));
  const route = read(path.join(backend, 'src/routes/procurementAccounting.js'));
  const service = read(path.join(backend, 'src/services/procurementAccountingService.js'));
  assert.match(migration, /supplier_invoice_items/);
  assert.match(migration, /validate_supplier_invoice_item_links/);
  assert.match(route, /supplier-invoices\/:id\/items/);
  assert.match(service, /addSupplierInvoiceItems/);
  assert.match(service, /INVOICE_SUPPLIER_MISMATCH/);
  assert.match(service, /INVOICE_LINES_ALREADY_EXIST/);
  const procurementPage = read(path.join(web, 'src/pages/Procurement.jsx'));
  const frontendApi = read(path.join(web, 'src/lib/api.js'));
  assert.match(procurementPage, /Save invoice items/);
  assert.match(procurementPage, /Invoice line subtotal, tax and total must match the invoice header/);
  assert.match(frontendApi, /createSupplierInvoiceItems/);
});

test('v5.7.8 RC49 supplier invoice line writes are serialized and transactional in PostgreSQL', () => {
  const migration = read(path.join(backend, 'supabase/migrations/20261010140000_v1_12_supplier_invoice_items_atomic.sql'));
  const service = read(path.join(backend, 'src/services/procurementAccountingService.js'));
  assert.match(migration, /add_supplier_invoice_items_atomic/);
  assert.match(migration, /for update/i);
  assert.match(migration, /Invoice lines already exist/);
  assert.match(migration, /revoke all on function .* from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function .* to service_role/i);
  assert.match(migration, /Invoice line values failed server-side calculation validation/);
  assert.match(service, /rpc\('add_supplier_invoice_items_atomic'/);
  assert.match(service, /p_company_id:companyId/);
  assert.match(service, /p_invoice_id:invoiceId/);
});

test('v5.7.8 RC50 maps atomic invoice conflicts to stable client errors', () => {
  const service = read(path.join(backend, 'src', 'services', 'procurementAccountingService.js'));
  const mappingTests = read(path.join(backend, 'test', 'supplier-invoice-atomic-error-mapping.test.js'));
  const migrationTests = read(path.join(backend, 'test', 'supplier-invoice-atomic-migration-contract.test.js'));
  assert.match(service, /mapSupplierInvoiceAtomicError/);
  assert.match(service, /if\(error\)throw mapSupplierInvoiceAtomicError\(error\)/);
  assert.match(mappingTests, /stable HTTP 409 conflict/);
  assert.match(mappingTests, /unknown database errors are not rewritten/);
  assert.match(migrationTests, /locks invoice row before duplicate check and inserts/);
});

test('v5.7.8 RC52 customer receipts use atomic posting and company-scoped idempotency', () => {
  const migration = read(path.join(backend, 'supabase/migrations/20261010160000_v1_14_atomic_receivables_payments.sql'));
  const service = read(path.join(backend, 'src/services/procurementAccountingService.js'));
  const ui = read(path.join(web, 'src/pages/Accounting.jsx'));
  assert.match(migration, /post_receivable_payment_atomic/);
  assert.match(migration, /accounts_receivable_payments_company_idempotency_uq/);
  assert.match(migration, /insert into public.accounting_journal_lines/);
  assert.match(service, /rpc\('post_receivable_payment_atomic'/);
  assert.match(service, /mapReceivablePaymentAtomicError/);
  assert.match(ui, /paymentRetryKeys=useRef\(new Map\(\)\)/);
  assert.match(ui, /idempotencyKey/);
});

test('v5.7.8 RC51 supplier payment and invoice balance update are serialized atomically', () => {
  const migration = read(path.join(backend, 'supabase/migrations/20261010150000_v1_13_supplier_payments_atomic.sql'));
  const service = read(path.join(backend, 'src/services/procurementAccountingService.js'));
  const tests = read(path.join(backend, 'test/supplier-payment-atomic-migration-contract.test.js'));
  assert.match(migration, /post_supplier_payment_atomic/);
  assert.match(migration, /for update/i);
  assert.match(migration, /Payment exceeds outstanding supplier invoice balance/);
  assert.match(migration, /Payment currency must match supplier invoice currency/);
  assert.match(migration, /update public\.supplier_invoices/);
  assert.match(migration, /insert into public\.accounting_journals/);
  assert.match(migration, /insert into public\.accounting_journal_lines/);
  assert.match(service, /rpc\('post_supplier_payment_atomic'/);
  assert.match(service, /mapSupplierPaymentAtomicError/);
  assert.match(tests, /locks invoice before checking balance and inserting payment/);
});

test('RC60 repairs the missing expenses.estimate_item_id schema and composite BOQ key used by the expenses API', () => {
  const migration = read(path.join(backend, 'supabase/migrations/20261011170000_v5_7_13_repair_expense_estimate_item.sql'));
  const service = read(path.join(backend, 'src/services/financeService.js'));
  assert.match(migration, /add column if not exists estimate_item_id uuid/i);
  assert.match(migration, /expense_estimate_tenant_fk/);
  assert.match(migration, /expenses_estimate_idx/);
  assert.match(migration, /notify pgrst, 'reload schema'/i);
  assert.match(service, /notes,estimate_item_id,supplier_invoice_id/);
});
