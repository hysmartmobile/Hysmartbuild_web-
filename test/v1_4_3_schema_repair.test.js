import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(
  new URL('../supabase/migrations/20261003090000_v1_4_3_company_identity_schema_repair.sql', import.meta.url),
  'utf8'
);

test('V1.4.3 schema repair restores company billing identity columns', () => {
  assert.match(migration, /add column if not exists billing_country_code text/i);
  assert.match(migration, /add column if not exists tax_country_code text/i);
  assert.match(migration, /add column if not exists unit_system text/i);
  assert.match(migration, /billing_country_code = coalesce/i);
  assert.match(migration, /tax_country_code = coalesce/i);
});
