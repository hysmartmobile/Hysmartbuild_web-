import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(process.cwd());
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');

test('production error handler preserves service HTTP status and validation errors',()=>{const s=read('src/middleware/errorHandler.js');assert.match(s,/err\?\.status/);assert.match(s,/ZodError/);});
test('billing migration uses the real company_members tenant table',()=>{const s=read('supabase/migrations/20261002120000_v1_3_billing_payments.sql');assert.doesNotMatch(s,/company_memberships/);assert.match(s,/company_members/);});

test('billing provider verification requires provider reference to match the HySmart reference',()=>{const s=read('src/services/billingService.js');assert.match(s,/returnedReference !== expectedReference/);assert.match(s,/verifiedReference !== String\(reference\)/);});
test('business authorization blocks expired subscriptions while billing remains accessible',()=>{const s=read('src/middleware/authorize.js');assert.match(s,/SUBSCRIPTION_REQUIRED/);assert.match(s,/permission\.startsWith\("billing:"\)/);});
