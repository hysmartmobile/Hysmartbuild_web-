import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve('');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('v5.12 monitoring scores only reconciled forecasts made before verified outcomes',()=>{
 const service=read('src/services/cashflowForecastLearningService.js');
 for(const safeguard of ["eq('reconciliation_status','RECONCILED')","observed_shortfall_next_30d","outcome_observed_at","generatedAt>asOf+86400000","observedAt<asOf+30*86400000","p.currency!==o.currency","INSUFFICIENT_EVIDENCE","calibrationBins"]){assert.ok(service.includes(safeguard),`missing monitoring safeguard: ${safeguard}`)}
});
test('v5.12 monitoring endpoint is protected by project access and read permission',()=>{
 const routes=read('src/routes/projectCostPlanning.js');
 assert.match(routes,/cashflow-forecast\/performance/);
 assert.match(routes,/cashflow-forecast:read/);
 assert.match(routes,/cashflowLearningService\.performance\(\{companyId:req\.params\.companyId,projectId:req\.params\.projectId\}\)/);
});
test('v5.12 frontend exposes forecast performance and calibration bands',()=>{
 const api=read('../HySmart-Build-Web/src/lib/api.js');
 const page=read('../HySmart-Build-Web/src/pages/ProjectCostPlanning.jsx');
 assert.match(api,/cashflowForecastPerformance/);
 assert.match(page,/Forecast accuracy monitoring/);
 assert.match(page,/calibrationBins/);
});
test('v5.12 runtime and PWA versions agree',()=>{
 const backend=JSON.parse(read('package.json'));
 const web=JSON.parse(read('../HySmart-Build-Web/package.json'));
 assert.equal(backend.version,'5.12.0');assert.equal(web.version,'5.12.0');
 assert.match(read('../HySmart-Build-Web/public/sw.js'),/5\.12\.0-forecast-monitoring/);
});
