import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const sql = fs.readFileSync(path.join(root, 'supabase/migrations/20261003190000_v1_6_3_production_schema_repair.sql'), 'utf8');
const workforce = fs.readFileSync(path.join(root, 'src/services/workforceService.js'), 'utf8');
const company = fs.readFileSync(path.join(root, 'src/services/companyService.js'), 'utf8');
const project = fs.readFileSync(path.join(root, 'src/services/projectService.js'), 'utf8');

test('V1.6.3 repairs legacy enabled/active payment provider schema without referencing missing enabled', () => {
  assert.match(sql, /add column if not exists active boolean/i);
  assert.match(sql, /set active = coalesce\(enabled, true\)/i);
  assert.match(sql, /column_name='enabled'/i);
});

test('V1.6.3 repairs named PostgREST profile relationships', () => {
  assert.match(sql, /company_members_user_profile_fk/);
  assert.match(sql, /project_members_user_profile_fk/);
  assert.match(company, /profiles!company_members_user_profile_fk/);
  assert.match(project, /profiles!project_members_user_profile_fk/);
});

test('V1.6.3 attendance listing avoids ambiguous PostgREST embeds', () => {
  assert.doesNotMatch(workforce, /attendance_records"\)\.select\([^\n]*workers!attendance_worker_tenant_fk/);
  assert.match(workforce, /from\("workers"\)/);
  assert.match(workforce, /from\("sites"\)/);
});

test('V1.6.3 keeps invitation acceptance atomic and service-role only', () => {
  assert.match(sql, /create or replace function public\.accept_company_invitation/i);
  assert.match(sql, /for update;/i);
  assert.match(sql, /grant execute on function public\.accept_company_invitation\(text,uuid,text\) to service_role/i);
});

test('V1.6.3 adds future-write tenant protection for procurement/accounting', () => {
  assert.match(sql, /purchase_orders_supplier_tenant_fk/);
  assert.match(sql, /supplier_invoices_supplier_tenant_fk/);
  assert.match(sql, /supplier_payments_invoice_tenant_fk/);
  assert.match(sql, /bank_transactions_account_tenant_fk/);
  assert.match(sql, /payroll_items_run_tenant_fk/);
});
