import test from 'node:test';
import assert from 'node:assert/strict';
import { costForecastFeatures, fitRidge, predictOverrun, regressionMetrics } from '../src/services/costForecastLearningService.js';

test('cost forecast features are finite, bounded and include procurement/variation/delivery signals',()=>{
 const x=costForecastFeatures({budget:1000000,materialsShare:.55,labourShare:.25,commitmentRatio:.7,variationRatio:.1,deliveryDelayDays:30,durationMonths:12,quoteCoverage:.8});
 assert.equal(x.length,10);assert.ok(x.every(Number.isFinite));assert.ok(x[1]===.55);assert.ok(x[2]===.25);assert.ok(x[3]>0);assert.ok(x[4]>0);assert.ok(x[5]>0);
});
test('ridge regression learns a synthetic cost overrun trend and evaluates chronological holdout rows',()=>{
 const rows=Array.from({length:30},(_,i)=>({x:[i/30,(i%3)/3],y:-.03+i*.006+(i%3)*.002}));
 const model=fitRidge(rows.slice(0,24));const metrics=regressionMetrics(model,rows.slice(24));
 assert.ok(Number.isFinite(predictOverrun(model,[.9,0])));assert.equal(metrics.sampleCount,6);assert.ok(metrics.mae<.05);assert.ok(metrics.rmse>=metrics.mae);
});
test('regression output is stable for flat target data',()=>{
 const rows=Array.from({length:12},(_,i)=>({x:[i/12,0.5],y:0.1}));const model=fitRidge(rows);assert.ok(Math.abs(predictOverrun(model,[.3,.5])-.1)<.03);
});
