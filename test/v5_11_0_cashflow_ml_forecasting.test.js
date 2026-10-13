import test from 'node:test';
import assert from 'node:assert/strict';
import { cashflowFeatures, fitLogistic, predictShortfallProbability, probabilityMetrics, CashflowForecastLearningService } from '../src/services/cashflowForecastLearningService.js';

function sampleRows(count=120){
  return Array.from({length:count},(_,i)=>{
    const opening=(i%12)*100+20;
    const inflows=(i%7)*40;
    const outflows=300+(i%5)*25;
    const y=(opening+inflows-outflows<0 || (i%11===0))?1:0;
    const row={openingCashBalance:opening,inflowsLast30d:inflows,outflowsLast30d:outflows,receivablesDueNext30d:(i%4)*35,payablesDueNext30d:100+(i%6)*40,minimumCashBuffer:180};
    return {x:cashflowFeatures(row),y,project_id:`p${i%12}`,as_of_date:new Date(Date.UTC(2024,0,i+1)).toISOString().slice(0,10)};
  });
}

test('cashflow features use relative cash ratios and stay finite',()=>{
 const x=cashflowFeatures({openingCashBalance:1000,inflowsLast30d:400,outflowsLast30d:500,receivablesDueNext30d:300,payablesDueNext30d:200,minimumCashBuffer:150});
 assert.equal(x.length,6);assert.ok(x.every(Number.isFinite));assert.ok(x[0]>0);assert.equal(cashflowFeatures({outflowsLast30d:0}).length,6);
});

test('logistic model emits bounded probability and meaningful chronological metrics',()=>{
 const rows=sampleRows();const split=96;const model=fitLogistic(rows.slice(0,split).map(r=>({x:r.x,y:r.y})));const p=predictShortfallProbability(model,rows[split].x);assert.ok(p>=0&&p<=1);
 const metrics=probabilityMetrics(model,rows.slice(split),rows.slice(0,split).reduce((s,r)=>s+r.y,0)/split);assert.equal(metrics.sampleCount,24);assert.ok(metrics.brierScore>=0&&metrics.brierScore<=1);assert.ok(metrics.baselineBrierScore>=0&&metrics.baselineBrierScore<=1);
});

test('forecast readiness withholds training when verified sample requirements are absent',async()=>{
 const supabase={from(){return {select(){return this},eq(){return this},order(){return this},limit(){return Promise.resolve({data:[],error:null})}}}};
 const service=new CashflowForecastLearningService({supabase});const r=await service.readiness({companyId:'c1',projectId:'p1'});
 assert.equal(r.trainingEligible,false);assert.ok(r.gaps.some(g=>g.includes('verified 30-day outcomes')));assert.ok(r.gaps.some(g=>g.includes('reconciled cashflow snapshot')));
});

test('outcome labels cannot be recorded before the full 30-day observation window',async()=>{
 const service=new CashflowForecastLearningService({supabase:{}});
 await assert.rejects(()=>service.createObservation({companyId:'c1',projectId:'p1',input:{asOfDate:'2026-10-01',currency:'NGN',openingCashBalance:0,inflowsLast30d:0,outflowsLast30d:0,receivablesDueNext30d:0,payablesDueNext30d:0,minimumCashBuffer:0,reconciliationStatus:'RECONCILED',outcomeShortfall:true,outcomeObservedAt:'2026-10-10T12:00:00.000Z'}}),/full observation window/);
});

test('service explicitly withholds unvalidated trained forecasts',async()=>{
 const supabase={from(){return {select(){return this},eq(){return this},order(){return this},limit(){return Promise.resolve({data:[],error:null})}}}};
 const service=new CashflowForecastLearningService({supabase});const r=await service.trainProject({companyId:'c1',projectId:'p1'});
 assert.equal(r.model.status,'INSUFFICIENT_DATA');assert.equal(r.prediction,null);
});
