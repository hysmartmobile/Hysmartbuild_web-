import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');

test('V5.3 migration defines tenant-safe reality layer tables and permissions',()=>{const p=fs.readFileSync(path.join(root,'supabase/migrations/20261006130000_v5_3_reality_layer.sql'),'utf8');for(const t of ['construction_reality_observations','construction_drawing_impacts','construction_reality_markers','construction_asbuilt_verifications'])assert.match(p,new RegExp(`create table if not exists public\\.${t}`));assert.match(p,/enable row level security/);assert.match(p,/reality:read/);assert.match(p,/reality:manage/);assert.match(p,/reality:verify/);});
test('V5.3 reality service uses project-scoped drawing, workfront and schedule sources',()=>{const p=fs.readFileSync(path.join(root,'src/services/realityLayerService.js'),'utf8');assert.match(p,/collaboration_drawings/);assert.match(p,/collaboration_drawing_revisions/);assert.match(p,/project_workfronts/);assert.match(p,/project_schedule_activities/);assert.match(p,/companyId/);assert.match(p,/projectId/);});
test('V5.3 routes expose reality capture, impact scan, markers and as-built verification',()=>{const p=fs.readFileSync(path.join(root,'src/routes/realityLayer.js'),'utf8');for(const x of ['/reality','/reality/observations','/reality/drawing-impact-scan','/reality/markers','/reality/markers/scan','/reality/as-built'])assert.match(p,new RegExp(x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));});
test('V5.3 app registers the Reality Layer router and readiness checks',()=>{const app=fs.readFileSync(path.join(root,'src/app.js'),'utf8');const svc=fs.readFileSync(path.join(root,'src/service.js'),'utf8');assert.match(app,/createRealityLayerRouter/);assert.match(app,/RealityLayerService/);for(const t of ['construction_reality_observations','construction_drawing_impacts','construction_reality_markers','construction_asbuilt_verifications'])assert.match(svc,new RegExp(t));});
test('V5.3 does not remove existing collaboration or evidence routes',()=>{const app=fs.readFileSync(path.join(root,'src/app.js'),'utf8');assert.match(app,/createCollaborationRouter/);assert.match(app,/createEvidenceEngineRouter/);assert.match(app,/createConstructionNetworkRouter/);});
