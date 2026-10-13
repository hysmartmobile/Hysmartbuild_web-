import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root=new URL('..',import.meta.url).pathname;
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
test('v3.6 migration creates workfront readiness and production truth',()=>{const s=read('../supabase/migrations/20261005010000_v3_6_workfront_production_intelligence.sql');for(const x of ['project_workfronts','project_workfront_readiness_checks','project_production_entries','production:read','production:manage','is_company_member(company_id)'])assert.match(s,new RegExp(x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')))});
test('v3.6 service exposes readiness, production and explainable recommendations',()=>{const s=read('../src/services/workfrontProductionService.js');for(const x of ['workfronts','dashboard','createWorkfront','upsertReadiness','createProduction','BLOCKED','productivityVariance','recommendations'])assert.match(s,new RegExp(x))});
test('v3.6 route protects reads and writes with production permissions',()=>{const s=read('../src/routes/workfrontProduction.js');assert.match(s,/production:read/);assert.match(s,/production:manage/);assert.match(s,/workfronts\/\:workfrontId\/readiness/);assert.match(s,/\/production/)});
test('v3.6 app wiring and web navigation are present',()=>{const app=read('../src/app.js');assert.match(app,/WorkfrontProductionService/);assert.match(app,/createWorkfrontProductionRouter/);const web=fs.readFileSync(new URL('../../HySmart-Build-Web/src/pages/Production.jsx',import.meta.url),'utf8');assert.match(web,/Production Control/);assert.match(web,/Record today’s production/)});
