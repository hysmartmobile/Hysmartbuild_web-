import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(path.resolve(here, '../supabase/migrations/20261013130000_v5_7_16_workflow_security_routing_hardening.sql'), 'utf8');
const web = path.resolve(here, '../../HySmart-Build-Web/src');
function sourceFiles(dir) { return readdirSync(dir).flatMap(name => { const file = path.join(dir, name); return statSync(file).isDirectory() ? sourceFiles(file) : /\.(jsx?|tsx?)$/.test(name) ? [file] : []; }); }

test('v5.7.16 removes direct public-schema table privileges from browser roles', () => {
  assert.match(migration, /revoke all on all tables in schema public from public, anon, authenticated/i);
  assert.match(migration, /alter default privileges in schema public revoke all on tables from public, anon, authenticated/i);
});

test('v5.7.16 removes direct browser execution of business RPCs and keeps service-role backend access', () => {
  assert.match(migration, /revoke execute on all functions in schema public from public, anon, authenticated/i);
  assert.match(migration, /grant execute on all functions in schema public to service_role/i);
  assert.match(migration, /revoke create on schema public from public, anon, authenticated/i);
  assert.doesNotMatch(migration, /grant execute on function public\.(?:approve_expense|mark_expense_paid)\([^;]+ to authenticated/i);
});


test('v5.7.16 browser source does not call business RPCs directly', () => {
  for (const file of sourceFiles(web)) assert.doesNotMatch(readFileSync(file, 'utf8'), /\.rpc\s*\(/, `browser business RPC found in ${path.relative(web, file)}`);
});
