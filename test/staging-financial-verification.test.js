import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sql = fs.readFileSync(path.join(backend, 'scripts', 'staging-financial-verification.sql'), 'utf8');
const runbook = fs.readFileSync(path.join(backend, 'STAGING-FINANCIAL-VERIFICATION-RC45.md'), 'utf8');

test('RC45 staging SQL verifies tenant composite FK and parent uniqueness without mutation', () => {
  assert.match(sql, /expenses_supplier_invoice_tenant_fk/);
  assert.match(sql, /FOREIGN KEY \(company_id, supplier_invoice_id\)/);
  assert.match(sql, /REFERENCES supplier_invoices\(company_id, id\)/);
  assert.match(sql, /UNIQUE \(company_id, id\)/);
  assert.match(sql, /expenses_supplier_invoice_idx/);
  assert.match(sql, /relrowsecurity/);
  assert.match(sql, /pg_policies/);
  assert.doesNotMatch(sql, /\b(insert into|update\s+public\.|delete from|alter table|create index|drop table)\b/i);
});

test('RC45 runbook distinguishes static catalog checks from actual staging tenant-isolation proof', () => {
  assert.match(runbook, /does not connect to a database, apply migrations, modify rows/);
  assert.match(runbook, /two disposable companies/);
  assert.match(runbook, /never the service-role key/);
  assert.match(runbook, /Do not describe RC45 as live-staging-verified/);
  assert.match(runbook, /invoice cost is apportioned to BOQ items using linked purchase-order line shares/);
});
