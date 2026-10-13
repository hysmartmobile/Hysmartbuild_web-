import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('v3.3 adds evidence-driven recovery intelligence',()=>{const s=read('src/services/recoveryIntelligenceService.js');for(const x of ['criticalOverdue','costVariance','materialRisk','overdueRfis','productivityIndex','fundingGap','recommendations','interventionScore'])assert.ok(s.includes(x),`missing ${x}`);});
test('recovery intelligence endpoint is tenant and permission protected',()=>{const s=read('src/routes/recoveryIntelligence.js');for(const x of ['/recovery-intelligence','recovery:read','companyId','projectId'])assert.ok(s.includes(x),`missing ${x}`);});
test('app wires recovery intelligence service and router',()=>{const s=read('src/app.js');assert.match(s,/RecoveryIntelligenceService/);assert.match(s,/createRecoveryIntelligenceRouter/);assert.match(s,/recoveryIntelligenceService/);});
test('web API exposes recovery intelligence',()=>{assert.match(read('../HySmart-Build-Web/src/lib/api.js'),/recoveryIntelligence/);});
test('recovery page surfaces evidence-driven recommendations',()=>{const s=read('../HySmart-Build-Web/src/pages/Recovery.jsx');for(const x of ['Recovery intelligence','Turn into commitment','recommendations','recoveryIntelligence'])assert.ok(s.includes(x),`missing ${x}`);});
