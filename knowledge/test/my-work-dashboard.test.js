import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read=path=>readFile(new URL(path,import.meta.url),'utf8');

test('Dashboard uses the My Work area and avoids analytics requests without analytics permission',async()=>{
 const dashboard=await read('../src/pages/Dashboard.jsx');
 assert.match(dashboard,/MyWorkPanel/);
 assert.match(dashboard,/permissions\.has\('my-work:read'\)/);
 assert.match(dashboard,/if\(!canLoadAnalytics\)/);
});

test('My Work presents all six personal workflow sections',async()=>{
 const source=await read('../src/components/MyWorkPanel.jsx');
 for(const section of ['My Tasks','Received / Inbox','Sent by Me','Awaiting My Review','Decisions & Returns','Reports & History']) assert.ok(source.includes(section),`missing section ${section}`);
 assert.match(source,/api\.myWorkAction/);
 assert.match(source,/requestSeq=useRef/);
 assert.match(source,/requestId===requestSeq\.current/);
 assert.match(source,/Confirm rejection/);
 assert.match(source,/Your response/);
 assert.match(source,/APPROVE_ONLY/);
});

test('My Work API sends actions to the company-scoped backend endpoint',async()=>{
 const source=await read('../src/lib/api.js');
 assert.match(source,/myWork:\(\)=>call\(`\/companies\/\$\{cid\(\)\}\/my-work`\)/);
 assert.match(source,/myWorkAction:p=>call\(`\/companies\/\$\{cid\(\)\}\/my-work\/actions`/);
});

test('company switch and offline queues remain bound to the selected request company',async()=>{
 const layout=await read('../src/components/Layout.jsx');
 const api=await read('../src/lib/api.js');
 const app=await read('../src/App.jsx');
 assert.match(layout,/workspaceRequest=useRef\(0\)/);
 assert.match(layout,/loc\.pathname==='\/'&&permissions\.has\('my-work:read'\)/);
 assert.match(layout,/requestId!==workspaceRequest\.current/);
 assert.match(layout,/addEventListener\('storage',onStorage\)/);
 assert.match(api,/requestCompanyId=String\(path\|\|''\)\.match/);
 assert.match(app,/companyBillingRequest=useRef\(0\)/);
 assert.match(app,/requestId!==companyBillingRequest\.current/);
});
