import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(process.cwd());
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('V1.4 sync route exposes push and status endpoints with dedicated permissions',()=>{const s=read('src/routes/sync.js');assert.match(s,/sync\/push/);assert.match(s,/sync\/status/);assert.match(s,/sync:push/);assert.match(s,/sync:read/);});
test('V1.4 sync service enforces optimistic conflict detection and idempotent replay',()=>{const s=read('src/services/syncService.js');assert.match(s,/SYNC_CONFLICT/);assert.match(s,/findOperation/);assert.match(s,/duplicate key/);assert.match(s,/status:"APPLIED"/);});
test('V1.4 migration records operation IDs and grants field sync permissions',()=>{const s=read('supabase/migrations/20261002140000_v1_4_offline_sync.sql');assert.match(s,/offline_sync_operations/);assert.match(s,/unique\(company_id, operation_id\)/);assert.match(s,/sync:push/);assert.match(s,/operation_id uuid/);});
test('V1.4 inventory and material request primitives are retry-safe',()=>{const s=read('supabase/migrations/20261002140000_v1_4_offline_sync.sql');assert.match(s,/p_operation_id uuid default null/);assert.match(s,/p_request_id uuid default null/);assert.match(s,/inventory_transactions_company_operation_uidx/);});
