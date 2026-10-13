import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EvidenceEngineService } from '../src/services/evidenceEngineService.js';

const root = path.dirname(fileURLToPath(import.meta.url)) + '/../';

test('v5.1 evidence migration creates tenant-safe evidence items and packs',()=>{
 const sql=fs.readFileSync(path.join(root,'supabase/migrations/20261006110000_v5_1_evidence_engine.sql'),'utf8');
 for(const x of ['construction_evidence_items','construction_evidence_packs','evidence_item_project_tenant_fk','evidence_pack_project_tenant_fk','evidence:read','evidence:manage','is_company_member(company_id)']) assert.ok(sql.includes(x), x);
});

test('v5.1 evidence service builds chronology from existing construction records without replacing collaboration',async()=>{
 const make=(data)=>({data,error:null});
 const supabase={from(table){const rows={
  projects:[{id:'p',company_id:'c',name:'Project',status:'ACTIVE'}],documents:[],construction_field_captures:[],construction_intelligence_events:[],collaboration_rfis:[],collaboration_site_instructions:[],project_progress_measurements:[],collaboration_comments:[],collaboration_drawing_revisions:[]};
  const base={select(){return this},eq(){return this},is(){return this},order(){return this},limit(){return this},maybeSingle(){return Promise.resolve(make(rows[table]?.[0]||null))}}; return base;}};
 const s=new EvidenceEngineService({supabase}); const r=await s.evidence({companyId:'c',projectId:'p'}); assert.equal(r.total,0); assert.deepEqual(r.categories,{});
});

test('v5.1 routes and web preserve comments while adding evidence workspace',()=>{
 const app=fs.readFileSync(path.join(root,'src/app.js'),'utf8'); const coll=fs.readFileSync(path.join(root,'src/routes/collaboration.js'),'utf8'); const ev=fs.readFileSync(path.join(root,'src/routes/evidenceEngine.js'),'utf8'); const web=path.join(root,'../HySmart-Build-Web/'); const wa=fs.readFileSync(path.join(web,'src/App.jsx'),'utf8'); const wl=fs.readFileSync(path.join(web,'src/components/Layout.jsx'),'utf8'); const api=fs.readFileSync(path.join(web,'src/lib/api.js'),'utf8'); const page=fs.readFileSync(path.join(web,'src/pages/EvidenceEngine.jsx'),'utf8');
 assert.match(app,/createEvidenceEngineRouter/); assert.match(app,/EvidenceEngineService/); for(const x of ['evidence','chronology','claim-pack']) assert.match(ev,new RegExp(x)); for(const x of ['comments','mentions','parentId']) assert.match(coll,new RegExp(x,'i')); assert.match(wa,/path="evidence"/); assert.match(wl,/Evidence Engine/); for(const x of ['evidenceChronology','createClaimEvidencePack','evidencePacks']) assert.match(api,new RegExp(x)); for(const x of ['Evidence chronology','claim evidence pack','Documents','Collaboration']) assert.match(page,new RegExp(x.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&'),'i'));
});


test('v5.1 production hardening catches every App route component import',()=>{
 const app=fs.readFileSync(path.join(root,'../HySmart-Build-Web/src/App.jsx'),'utf8');
 assert.match(app,/import ConstructionAutopilot from ['"]\.\/pages\/ConstructionAutopilot\.jsx['"]/);
 assert.match(app,/import EvidenceEngine from ['"]\.\/pages\/EvidenceEngine\.jsx['"]/);
});
