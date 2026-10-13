import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';
const root=path.resolve(process.cwd());const read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('v3.0 adds control tower permissions',()=>{const s=read('supabase/migrations/20261004230000_v3_0_construction_control_tower.sql');assert.match(s,/control-tower:read/);assert.match(s,/control-tower:manage/);assert.match(s,/PROJECT_MANAGER/);});
test('control tower answers five management questions',()=>{const s=read('src/services/controlTowerService.js');for(const x of ['time:','money:','cash:','execution:','action:'])assert.match(s,new RegExp(x.replace(':','\\s*\\:')));assert.match(s,/recommendations/);assert.match(s,/fundingGap/);});
test('control tower routes are protected',()=>{const s=read('src/routes/controlTower.js');assert.match(s,/control-tower/);assert.match(s,/authorize\('control-tower:read'\)/);assert.match(s,/authorize\('control-tower:manage'\)/);});
test('app registers control tower service and route',()=>{const s=read('src/app.js');assert.match(s,/ControlTowerService/);assert.match(s,/createControlTowerRouter/);assert.match(s,/controlTowerService/);});
test('web exposes a dedicated control tower experience',()=>{const a=read('../HySmart-Build-Web/src/App.jsx');assert.match(a,/control-tower/);const api=read('../HySmart-Build-Web/src/lib/api.js');assert.match(api,/controlTower/);const l=read('../HySmart-Build-Web/src/components/Layout.jsx');assert.match(l,/Control Tower/);});
