import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFieldCapture } from '../src/services/constructionAutopilotService.js';

const root = path.dirname(fileURLToPath(import.meta.url)) + '/../';

test('v5.0 ambient capture extracts production, workforce and blocker signals',()=>{
  const x=parseFieldCapture("We completed 420 m² blockwork with 8 workers, but couldn't continue the east wing because electrical sleeves aren't ready.");
  assert.equal(x.progress.quantity,420);
  assert.equal(x.progress.unit,'m²');
  assert.equal(x.workforceCount,8);
  assert.match(x.blocker,/couldn't continue/i);
  assert.ok(x.categories.includes('PRODUCTION'));
  assert.ok(x.categories.includes('WORKFORCE'));
  assert.ok(x.categories.includes('BLOCKER'));
  assert.equal(x.delaySignal,true);
});

test('v5.0 ambient capture detects material, safety and quality language',()=>{
  const x=parseFieldCapture('Cement delivery is late and we have a safety hazard near the hoist; rework is required on the slab because of a defect.');
  assert.ok(x.categories.includes('MATERIAL'));
  assert.ok(x.categories.includes('SAFETY'));
  assert.ok(x.categories.includes('QUALITY'));
  assert.ok(x.categories.includes('DELAY'));
});

test('v5.0 migration creates tenant-safe capture storage and autopilot permissions',()=>{
  const sql=fs.readFileSync(path.join(root,'supabase/migrations/20261006100000_v5_0_construction_autopilot.sql'),'utf8');
  for(const x of ['construction_field_captures','construction_intelligence_events','autopilot:read','autopilot:manage','is_company_member(company_id)','project_id uuid']) assert.match(sql,new RegExp(x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
});

test('v5.0 backend routes preserve existing collaboration and add autopilot as an additive layer',()=>{
  const app=fs.readFileSync(path.join(root,'src/app.js'),'utf8');
  const collaboration=fs.readFileSync(path.join(root,'src/routes/collaboration.js'),'utf8');
  const autopilot=fs.readFileSync(path.join(root,'src/routes/constructionAutopilot.js'),'utf8');
  assert.match(app,/createCollaborationRouter/);
  assert.match(app,/createConstructionAutopilotRouter/);
  for(const x of ['autopilot/capture','autopilot/captures','autopilot/intelligence','autopilot/morning-brief']) assert.match(autopilot,new RegExp(x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  for(const x of ['comments','parentId','mentions']) assert.match(collaboration,new RegExp(x,'i'));
});

test('v5.0 web Autopilot is wired without removing collaboration navigation',()=>{
  const web=path.join(root,'../HySmart-Build-Web/');
  const app=fs.readFileSync(path.join(web,'src/App.jsx'),'utf8');
  const layout=fs.readFileSync(path.join(web,'src/components/Layout.jsx'),'utf8');
  const api=fs.readFileSync(path.join(web,'src/lib/api.js'),'utf8');
  const page=fs.readFileSync(path.join(web,'src/pages/ConstructionAutopilot.jsx'),'utf8');
  assert.match(app,/path="autopilot"/);
  assert.match(layout,/Construction Autopilot/);
  assert.match(layout,/Collaboration/);
  for(const x of ['autopilotBrief','autopilotCapture','autopilotIntelligence','autopilotEventStatus']) assert.match(api,new RegExp(x));
  for(const x of ['Ambient field capture','WHY','EVIDENCE','CONSEQUENCE','ACTION','Voice','Company Memory']) assert.match(page,new RegExp(x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'));
});
