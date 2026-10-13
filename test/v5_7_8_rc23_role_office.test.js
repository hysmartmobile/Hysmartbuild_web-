import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const read=p=>fs.readFileSync(path.resolve(root,p),'utf8');
const dashboard=read('../HySmart-Build-Web/src/pages/Dashboard.jsx');
const layout=read('../HySmart-Build-Web/src/components/Layout.jsx');
test('role office dashboard labels the member and company context',()=>{
 assert.match(dashboard,/outlet\.dashboardLabel/);assert.match(dashboard,/outlet\.displayName/);assert.match(dashboard,/outlet\.companyName/);assert.match(layout,/dashboardLabel=`\$\{roleLabel\} Dashboard`/);
});
test('role office links are permission-filtered and finance summary is gated',()=>{
 assert.match(dashboard,/WORK_AREAS\.filter\(x=>permissions\.has\(x\.permission\)\)/);assert.match(dashboard,/canSeeFinance&&/);assert.match(dashboard,/accounting:read/);
});
test('dashboard data reloads when active company changes',()=>{
 assert.match(layout,/companyId:company\?\.id\|\|null/);assert.match(dashboard,/\[outlet\.companyId,outlet\.companyName,outlet\.role\]/);
});
