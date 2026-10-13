import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';
const root=path.resolve(process.cwd());const read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('v3.2 adds measurable recovery commitments with tenant-safe schema',()=>{const s=read('supabase/migrations/20261004250000_v3_2_recovery_execution.sql');for(const x of ['recovery_plan_commitments','recovery_commitments_plan_tenant_fk','row level security','intervention_type','due_date','target_value'])assert.match(s,new RegExp(x.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')));});
test('recovery service supports commitment lifecycle and summary',()=>{const s=read('src/services/recoveryService.js');for(const x of ['createCommitment','updateCommitment','commitmentSummary','completionRate','overdue'])assert.match(s,new RegExp(x));});
test('recovery routes expose commitment lifecycle under recovery permissions',()=>{const s=read('src/routes/recovery.js');for(const x of ['/commitments','recovery-commitments','recovery:read','recovery:manage'])assert.match(s,new RegExp(x.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')));});
test('web exposes measurable recovery commitments',()=>{const a=read('../HySmart-Build-Web/src/lib/api.js');const p=read('../HySmart-Build-Web/src/pages/Recovery.jsx');for(const x of ['recoveryCommitments','createRecoveryCommitment','updateRecoveryCommitment','Recovery commitments','interventionType','targetValue']){assert.ok(a.includes(x)||p.includes(x),`missing ${x}`);/*(/[.*+?^${}()|[\\]\\]/g,'\\$&')));*/}});
