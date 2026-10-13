import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('v5.9 closure evidence schema is additive and records verifier identity/time',()=>{
 const m=read('supabase/migrations/20261009170000_v5_9_daily_loop_verified_closure.sql');
 for(const token of ['add column if not exists evidence_reference','add column if not exists verified_by','add column if not exists verified_at','begin;','commit;']) assert.ok(m.includes(token),`missing ${token}`);
});
test('v5.9 action closure requires explicit verification, notes and evidence reference',()=>{
 const s=read('src/services/operatingSystemService.js');
 assert.match(s,/input\.markDone===true&&\(!verifiedResolution\|\|!String\(input\.notes\|\|''\)\.trim\(\)\|\|!String\(input\.evidenceReference\|\|''\)\.trim\(\)\)/);
 assert.match(s,/ACTION_CLOSURE_EVIDENCE_REQUIRED/);
 assert.match(s,/status:input\.markDone===true&&verifiedResolution\?'DONE':action\.status/);
});
test('v5.9 rejects non-finite outcome measurements and scopes action writes to company',()=>{
 const s=read('src/services/operatingSystemService.js');
 assert.match(s,/Number\.isFinite\(beforeValue\)/);
 assert.match(s,/Number\.isFinite\(afterValue\)/);
 assert.match(s,/const patch=\{metadata,updated_at:new Date\(\)\.toISOString\(\),status:input\.markDone===true&&verifiedResolution\?'DONE':action\.status\}/);
 assert.match(s,/\.eq\('company_id',companyId\)\.eq\('id',actionId\)/);
});
test('v5.9 Today UI keeps existing action acknowledgement compatible',()=>{
 const ui=read('../HySmart-Build-Web/src/pages/Today.jsx');
 assert.match(ui,/outcome:'ACTION_ACKNOWLEDGED'/);
 assert.ok(fs.existsSync(path.join(root,'test/v5_7_release_gate.test.js')));
});
test('Version 4 executive brief explains snapshot provenance and financial interpretation',()=>{
 const s=read('src/services/operatingSystemService.js');
 assert.match(s,/recordCounts:current\.companyMemory\?\.recordCounts\|\|\{\}/);
 assert.match(s,/Gross flagged exposure, not confirmed loss; categories may overlap\./);
 assert.match(s,/Point-in-time summary generated from successful source queries; not a live streaming view\./);
 const ui=read('../HySmart-Build-Web/src/pages/Today.jsx');
 assert.match(ui,/Snapshot source time:/);
 assert.match(ui,/Money flagged is gross exposure, not confirmed loss; categories may overlap\./);
});
