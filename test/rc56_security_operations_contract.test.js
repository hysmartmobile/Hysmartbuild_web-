import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('RC56 critical inventory and GRN routines verify authenticated company membership and lock mutable rows',()=>{const inv=read('supabase/migrations/20261001230000_v0_7_materials_inventory.sql');const grn=read('supabase/migrations/20261006000000_v4_4_no_double_entry_grn_inventory.sql');assert.match(inv,/auth\.uid\(\) <> p_user_id/);assert.match(inv,/status='ACTIVE'/);assert.match(inv,/for update/i);assert.match(grn,/auth\.uid\(\) <> p_user_id/);assert.match(grn,/status='ACTIVE'/);assert.match(grn,/from purchase_orders where company_id=p_company_id and id=p_purchase_order_id for update/i);});
test('RC56 operations checklist requires off-host backups, restore rehearsal, tenant negative tests and incident controls',()=>{const ops=read('RC56-SECURITY-BACKUP-OPERATIONS.md');for(const phrase of ['off-host','restore rehearsal','cross-company','RLS','rotate database','incident','retention','NO-GO'])assert.ok(ops.toLowerCase().includes(phrase.toLowerCase()),`missing operational requirement ${phrase}`);});
test('RC56 read-only staging verification never mutates application data',()=>{const sql=read('scripts/staging-financial-verification.sql');assert.doesNotMatch(sql,/\b(insert\s+into|update\s+public\.|delete\s+from|alter\s+table|drop\s+table)\b/i);});
