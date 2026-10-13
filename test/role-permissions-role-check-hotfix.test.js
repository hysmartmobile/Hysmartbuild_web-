import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const expectedRoles = [
  'SUPER_ADMIN','COMPANY_OWNER','COMPANY_ADMIN','DIRECTOR','PROJECT_MANAGER','SITE_ENGINEER','SITE_SUPERVISOR',
  'ACCOUNTANT','STOREKEEPER','HR_MANAGER','WORKER','CLIENT','CEO','CIVIL_ENGINEER','MANAGEMENT','COMMERCIAL_MANAGER',
  'QUANTITY_SURVEYOR','PROCUREMENT_OFFICER'
];

test('RC61 role-permissions hotfix permits CEO and all supported application roles', () => {
  const sql = read('supabase/migrations/20261011180000_v5_7_14_repair_role_permissions_role_check.sql');
  assert.match(sql, /drop constraint if exists role_permissions_role_check/i);
  assert.match(sql, /add constraint role_permissions_role_check check/i);
  for (const role of expectedRoles) assert.match(sql, new RegExp(`'${role}'`));
});

test('executive grants migration repairs stale role constraint before inserting CEO permissions', () => {
  const sql = read('supabase/migrations/20261009223000_v5_7_11_executive_companywide_access.sql');
  const constraintRepair = sql.indexOf('add constraint role_permissions_role_check');
  const ceoGrant = sql.indexOf("('CEO')");
  assert.ok(constraintRepair >= 0 && ceoGrant > constraintRepair, 'role constraint must be repaired before CEO grant insert');
});
