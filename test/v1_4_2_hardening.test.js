import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(new URL('../supabase/migrations/20261002160000_v1_4_2_finance_and_me_hardening.sql', import.meta.url), 'utf8');
const authService = fs.readFileSync(new URL('../src/services/authService.js', import.meta.url), 'utf8');
const meRoute = fs.readFileSync(new URL('../src/routes/me.js', import.meta.url), 'utf8');

test('V1.4.2 adds the missing composite unique key required by the expense tenant FK', () => {
  assert.match(migration, /expenses_company_id_id_unique_v09/);
  assert.match(migration, /unique \(company_id, id\)/);
  assert.match(migration, /references public\.expenses\(company_id, id\)/);
});

test('V1.4.2 makes finance constraints and policies rerun-safe', () => {
  assert.match(migration, /if not exists \(\s*select 1 from pg_constraint/);
  assert.match(migration, /drop policy if exists expenses_member_all/);
  assert.match(migration, /drop policy if exists financial_records_member_all/);
});

test('V1.4.2 enforces finance permissions inside the database', () => {
  assert.match(migration, /create or replace function public\.has_company_permission/);
  assert.match(migration, /expense:approve/);
  assert.match(migration, /expense:pay/);
  assert.match(migration, /finance:read/);
  assert.match(migration, /finance:create/);
});

test('V1.4.2 makes /api/v1/me resilient when an Auth user has no profile row', () => {
  assert.match(authService, /\.maybeSingle\(\)/);
  assert.match(authService, /from\("profiles"\)[\s\S]*\.insert/);
  assert.match(authService, /createError\.code === "23505"/);
  assert.match(meRoute, /req\.user\.user_metadata/);
});
