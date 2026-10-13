import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url))+'/../';

test('v5.2 migration creates tenant-safe network participants, submissions and commercial exchanges',()=>{
 const sql=fs.readFileSync(path.join(root,'supabase/migrations/20261006120000_v5_2_construction_network.sql'),'utf8');
 for(const x of ['construction_network_participants','construction_network_submissions','construction_network_commercial_exchanges','company_id uuid','project_id uuid','is_company_member(company_id)','network:read','network:manage','network:submit','network:approve','network:commercial']) assert.match(sql,new RegExp(x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
 assert.match(sql,/visible_to_external boolean not null default true/);
 assert.match(sql,/is_company_network_manager/);
 assert.match(sql,/network_submissions_insert/);
 assert.match(sql,/network_exchanges_insert/);
 assert.match(sql,/visible_to_external=true/);
 assert.match(sql,/network_type in \('CLIENT','SUBCONTRACTOR','SUPPLIER','CONSULTANT'\)/);
});

test('v5.2 network routes are project-scoped and separate submission from approval permissions',()=>{
 const route=fs.readFileSync(path.join(root,'src/routes/constructionNetwork.js'),'utf8');
 for(const x of ['network','network/invitations','network/submissions','network/commercial','network:read','network:manage','network:submit','network:approve','network:commercial']) assert.match(route,new RegExp(x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
 assert.match(route,/projects\/:projectId\/network/);
});

test('v5.2 company invitation acceptance creates a restricted network participant after authenticated acceptance',()=>{
 const service=fs.readFileSync(path.join(root,'src/services/companyService.js'),'utf8');
 assert.match(service,/network_type/); assert.match(service,/network_project_id/); assert.match(service,/construction_network_participants/); assert.match(service,/onConflict: 'company_id,project_id,user_id'/);
});

test('v5.2 external commercial visibility is explicit and does not expose internal margin or cash data',()=>{
 const service=fs.readFileSync(path.join(root,'src/services/constructionNetworkService.js'),'utf8');
 assert.match(service,/visible_to_external:true/);
 assert.match(service,/participant\({companyId,projectId,userId}\)/);
 assert.match(service,/pQuery\.eq\('id',own\.id\)/);
 assert.doesNotMatch(service,/forecast_margin|cash_position|minimum_cash|payroll/);
});

test('v5.2 web network page is additive and preserves Collaboration, Evidence and Autopilot routes',()=>{
 const web=path.join(root,'../HySmart-Build-Web/');
 const app=fs.readFileSync(path.join(web,'src/App.jsx'),'utf8');
 const layout=fs.readFileSync(path.join(web,'src/components/Layout.jsx'),'utf8');
 const api=fs.readFileSync(path.join(web,'src/lib/api.js'),'utf8');
 const page=fs.readFileSync(path.join(web,'src/pages/ConstructionNetwork.jsx'),'utf8');
 assert.match(app,/path="network"/); assert.match(app,/ConstructionNetwork/);
 for(const x of ['Collaboration','Evidence Engine','Construction Autopilot','Construction Network']) assert.match(layout,new RegExp(x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
 for(const x of ['constructionNetwork','networkInvite','networkSubmit','networkReviewSubmission','networkCommercial','networkReviewCommercial']) assert.match(api,new RegExp(x));
 for(const x of ['Clients','subcontractors','suppliers','consultants','Commercial exchange','project-scoped']) assert.match(page,new RegExp(x,'i'));
});

test('v5.2 readiness includes all network schema tables',()=>{
 const service=fs.readFileSync(path.join(root,'src/service.js'),'utf8');
 for(const x of ['construction_network_participants','construction_network_submissions','construction_network_commercial_exchanges']) assert.match(service,new RegExp(x));
});
