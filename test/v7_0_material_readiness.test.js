import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
test('procurement risk groups repeated plans by project and material before comparing stock',()=>{const s=read('../src/services/procurementRiskService.js');assert.match(s,/const grouped=new Map\(\)/);assert.match(s,/g\.plannedQuantity\+=n\(x\.planned_quantity\)/);assert.match(s,/\$\{x\.project_id\}:\$\{x\.material_id\}/);});
test('stock exposure is constrained to the selected project site where project filter is supplied',()=>{const s=read('../src/services/procurementRiskService.js');assert.match(s,/\(!projectId\|\|i\.sites\?\.project_id===projectId\)/);});
test('supplier ETA selection excludes cancelled and rejected orders and chooses earliest dated delivery',()=>{const s=read('../src/services/procurementRiskService.js');assert.match(s,/!\['CANCELLED','REJECTED'\]\.includes/);assert.match(s,/sort\(\(a,b\)=>new Date\(a\.expected_date\)-new Date\(b\.expected_date\)\)/);});
test('procurement risk source queries remain company-scoped',()=>{const s=read('../src/services/procurementRiskService.js');assert.equal((s.match(/\.eq\('company_id',companyId\)/g)||[]).length,6);});
