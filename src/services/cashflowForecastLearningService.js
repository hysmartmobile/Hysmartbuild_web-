const MODEL_TYPE = 'PROJECT_CASH_SHORTFALL_LOGISTIC_V1';
const MIN_ROWS = 60;
const MIN_PROJECTS = 10;
const MIN_PER_CLASS = 10;
const num = v => Number.isFinite(Number(v)) ? Number(v) : 0;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, num(v)));
const round = v => Number(Number(v).toFixed(5));
const mean = xs => xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : 0;
const sigmoid = z => 1/(1+Math.exp(-clamp(z,-30,30)));

export function cashflowFeatures(row) {
  const spend = Math.max(1, num(row.outflowsLast30d));
  return [
    clamp(num(row.openingCashBalance)/spend,-5,10),
    clamp(num(row.inflowsLast30d)/spend,0,10),
    clamp(num(row.receivablesDueNext30d)/spend,0,10),
    clamp(num(row.payablesDueNext30d)/spend,0,10),
    clamp(num(row.minimumCashBuffer)/spend,0,10),
    clamp((num(row.openingCashBalance)+num(row.inflowsLast30d)-num(row.outflowsLast30d))/spend,-5,10)
  ];
}
function fitScaler(rows) {
  const means=rows[0].x.map((_,i)=>mean(rows.map(r=>r.x[i])));
  const scales=rows[0].x.map((_,i)=>Math.sqrt(mean(rows.map(r=>(r.x[i]-means[i])**2)))||1);
  return {means,scales};
}
function scale(x,s){return x.map((v,i)=>(v-s.means[i])/s.scales[i]);}
export function fitLogistic(rows,{learningRate=0.04,iterations=1800,lambda=0.02}={}) {
  const scaler=fitScaler(rows); const data=rows.map(r=>({x:[1,...scale(r.x,scaler)],y:r.y}));
  let weights=Array(data[0].x.length).fill(0); weights[0]=Math.log((mean(data.map(r=>r.y))+0.001)/(1.001-mean(data.map(r=>r.y))));
  for(let step=0;step<iterations;step++){
    const grad=Array(weights.length).fill(0);
    for(const r of data){const p=sigmoid(r.x.reduce((s,v,i)=>s+v*weights[i],0));for(let j=0;j<weights.length;j++)grad[j]+=(p-r.y)*r.x[j];}
    for(let j=0;j<weights.length;j++){grad[j]/=data.length;if(j>0)grad[j]+=lambda*weights[j];weights[j]-=learningRate*grad[j];}
  }
  return {weights,scaler,lambda,iterations};
}
export function predictShortfallProbability(model,x){return sigmoid([1,...scale(x,model.scaler)].reduce((s,v,i)=>s+v*model.weights[i],0));}
export function probabilityMetrics(model,rows,baselineProbability){
  const probs=rows.map(r=>predictShortfallProbability(model,r.x));
  return {sampleCount:rows.length,brierScore:round(mean(probs.map((p,i)=>(p-rows[i].y)**2))),baselineBrierScore:round(mean(rows.map(r=>(baselineProbability-r.y)**2))),actualShortfallRate:round(mean(rows.map(r=>r.y))),predictedShortfallRate:round(mean(probs))};
}

export class CashflowForecastLearningService {
  constructor({supabase}){this.supabase=supabase;}
  async createObservation({companyId,projectId,userId,input}){
    const asOf=new Date(input.asOfDate);if(Number.isNaN(asOf.getTime()))throw new Error('A valid snapshot date is required.');if(asOf>new Date())throw new Error('Cashflow snapshot date cannot be in the future.');
    if(input.outcomeShortfall!==null&&input.outcomeShortfall!==undefined){
      const observedAt=new Date(input.outcomeObservedAt||'');
      if(Number.isNaN(observedAt.getTime())||observedAt<new Date(asOf.getTime()+30*86400000)||observedAt>new Date())throw new Error('A 30-day outcome can only be recorded after the full observation window has elapsed.');
    }
    const {data:project,error:projectError}=await this.supabase.from('projects').select('id,company_id,currency').eq('company_id',companyId).eq('id',projectId).maybeSingle();if(projectError)throw projectError;if(!project)throw new Error('Project not found in this company.');
    const currency=String(input.currency||project.currency||'').toUpperCase();if(!/^[A-Z]{3}$/.test(currency))throw new Error('Use a valid three-letter currency code.');
    const payload={company_id:companyId,project_id:projectId,as_of_date:input.asOfDate,currency,opening_cash_balance:input.openingCashBalance,inflows_last_30d:input.inflowsLast30d,outflows_last_30d:input.outflowsLast30d,receivables_due_next_30d:input.receivablesDueNext30d,payables_due_next_30d:input.payablesDueNext30d,minimum_cash_buffer:input.minimumCashBuffer,reconciliation_status:input.reconciliationStatus,evidence_note:input.evidenceNote||null,observed_shortfall_next_30d:input.outcomeShortfall??null,outcome_observed_at:input.outcomeObservedAt||null,created_by:userId||null,updated_at:new Date().toISOString()};
    const {data,error}=await this.supabase.from('hysmart_project_cashflow_observations').upsert(payload,{onConflict:'company_id,project_id,as_of_date'}).select('id,project_id,as_of_date,currency,reconciliation_status,observed_shortfall_next_30d,outcome_observed_at,created_at').single();if(error)throw error;return data;
  }
  async _rows(companyId){const {data,error}=await this.supabase.from('hysmart_project_cashflow_observations').select('id,company_id,project_id,as_of_date,currency,opening_cash_balance,inflows_last_30d,outflows_last_30d,receivables_due_next_30d,payables_due_next_30d,minimum_cash_buffer,reconciliation_status,observed_shortfall_next_30d,outcome_observed_at,evidence_note').eq('company_id',companyId).eq('reconciliation_status','RECONCILED').order('as_of_date',{ascending:true}).limit(20000);if(error)throw error;return (data||[]).map(r=>({...r,x:cashflowFeatures({openingCashBalance:r.opening_cash_balance,inflowsLast30d:r.inflows_last_30d,outflowsLast30d:r.outflows_last_30d,receivablesDueNext30d:r.receivables_due_next_30d,payablesDueNext30d:r.payables_due_next_30d,minimumCashBuffer:r.minimum_cash_buffer}),y:typeof r.observed_shortfall_next_30d==='boolean'?(r.observed_shortfall_next_30d?1:0):null}));}
  async readiness({companyId,projectId}){
    const rows=await this._rows(companyId);const labeled=rows.filter(r=>r.y!==null&&r.outcome_observed_at&&new Date(r.outcome_observed_at)>=new Date(new Date(r.as_of_date).getTime()+30*86400000));const projects=new Set(labeled.map(r=>r.project_id));const shortfall=labeled.filter(r=>r.y===1).length;const noShortfall=labeled.length-shortfall;const target=rows.filter(r=>r.project_id===projectId).at(-1)||null;const gaps=[];
    if(labeled.length<MIN_ROWS)gaps.push(`Only ${labeled.length} reconciled snapshots have verified 30-day outcomes; ${MIN_ROWS} are required.`);
    if(projects.size<MIN_PROJECTS)gaps.push(`Only ${projects.size} projects contribute labelled snapshots; ${MIN_PROJECTS} are required.`);
    if(shortfall<MIN_PER_CLASS||noShortfall<MIN_PER_CLASS)gaps.push(`Outcome classes need at least ${MIN_PER_CLASS} each (shortfall=${shortfall}, no-shortfall=${noShortfall}).`);
    if(!target)gaps.push('No reconciled cashflow snapshot exists for this project.');
    if(target&&Date.now()-new Date(target.as_of_date).getTime()>45*86400000)gaps.push('The latest project snapshot is older than 45 days; refresh it before relying on a forecast.');
    const targetCurrencyConsistent=!!target&&!rows.filter(r=>r.project_id===projectId).some(r=>r.currency!==target.currency);if(target&&!targetCurrencyConsistent)gaps.push('Project snapshots contain multiple currencies; reconcile the history before training.');
    return {companyId,projectId,labeledSnapshotCount:labeled.length,projectsWithLabels:projects.size,shortfallOutcomes:shortfall,noShortfallOutcomes:noShortfall,targetSnapshot:target?{id:target.id,asOfDate:target.as_of_date,currency:target.currency,openingCashBalance:num(target.opening_cash_balance),inflowsLast30d:num(target.inflows_last_30d),outflowsLast30d:num(target.outflows_last_30d),receivablesDueNext30d:num(target.receivables_due_next_30d),payablesDueNext30d:num(target.payables_due_next_30d),minimumCashBuffer:num(target.minimum_cash_buffer)}:null,trainingEligible:labeled.length>=MIN_ROWS&&projects.size>=MIN_PROJECTS&&shortfall>=MIN_PER_CLASS&&noShortfall>=MIN_PER_CLASS&&!!target&&targetCurrencyConsistent&&Date.now()-new Date(target.as_of_date).getTime()<=45*86400000,gaps,guardrails:['Only reconciled snapshots with an outcome recorded after the complete 30-day observation window are training labels.','The model is trained on earlier dated observations and evaluated on later observations; feature scaling is fitted only on training data.','Forecasts are withheld unless the model improves Brier score over the training-period base-rate baseline.','Forecasts are decision support and require finance review; this model does not replace a cashflow statement or treasury approval.']};
  }
  async trainProject({companyId,projectId,userId=null}){
    const readiness=await this.readiness({companyId,projectId});const rows=await this._rows(companyId);const labeled=rows.filter(r=>r.y!==null&&r.outcome_observed_at&&new Date(r.outcome_observed_at)>=new Date(new Date(r.as_of_date).getTime()+30*86400000));
    if(!readiness.trainingEligible){return {model:{status:'INSUFFICIENT_DATA',training_sample_count:labeled.length},readiness,prediction:null,message:'Cash-shortfall ML forecast withheld until data-quality and sample-size requirements pass.'};}
    const split=Math.floor(labeled.length*.8);const train=labeled.slice(0,split),test=labeled.slice(split);if(!train.length||!test.length)return {model:{status:'INSUFFICIENT_DATA',training_sample_count:labeled.length},readiness,prediction:null};
    if(new Set(train.map(r=>r.y)).size<2||new Set(test.map(r=>r.y)).size<2){const message='Chronological train and holdout partitions must each contain both shortfall and no-shortfall outcomes. No probability forecast is published.';const {data:model,error}=await this.supabase.from('hysmart_cashflow_forecast_models').insert({company_id:companyId,model_type:MODEL_TYPE,status:'EVALUATION_FAILED',training_sample_count:labeled.length,project_count:readiness.projectsWithLabels,evaluation_metrics:{holdoutStart:test[0]?.as_of_date||null,reason:'One or both chronological partitions do not contain both outcome classes.'},parameters:{},trained_by:userId}).select('id,status,training_sample_count,project_count,evaluation_metrics,trained_at').single();if(error)throw error;return {model,readiness,prediction:null,message};}
    const baseline=mean(train.map(r=>r.y));const evalModel=fitLogistic(train.map(r=>({x:r.x,y:r.y})));const metrics=probabilityMetrics(evalModel,test,baseline);const passes=metrics.brierScore<metrics.baselineBrierScore;
    if(!passes){const {data:model,error}=await this.supabase.from('hysmart_cashflow_forecast_models').insert({company_id:companyId,model_type:MODEL_TYPE,status:'EVALUATION_FAILED',training_sample_count:labeled.length,project_count:readiness.projectsWithLabels,evaluation_metrics:{chronologicalHoldout:metrics,holdoutStart:test[0]?.as_of_date||null,beatsBaseRateBaseline:false},parameters:{},trained_by:userId}).select('id,status,training_sample_count,project_count,evaluation_metrics,trained_at').single();if(error)throw error;return {model,readiness,prediction:null,message:'The model did not beat the training-period base-rate baseline. No probability forecast is published.'};}
    const finalModel=fitLogistic(labeled.map(r=>({x:r.x,y:r.y})));const {data:model,error:modelError}=await this.supabase.from('hysmart_cashflow_forecast_models').insert({company_id:companyId,model_type:MODEL_TYPE,status:'READY',training_sample_count:labeled.length,project_count:readiness.projectsWithLabels,evaluation_metrics:{chronologicalHoldout:metrics,holdoutStart:test[0]?.as_of_date||null,beatsBaseRateBaseline:true,evaluationMethod:'Chronological 80/20 holdout; training-only feature scaling; Brier score compared with training-period base rate.'},parameters:{weights:finalModel.weights,scaler:finalModel.scaler,lambda:finalModel.lambda,iterations:finalModel.iterations,featureNames:['opening_cash_vs_recent_outflow','recent_inflow_vs_outflow','receivables_due_vs_outflow','payables_due_vs_outflow','minimum_buffer_vs_outflow','recent_net_cash_vs_outflow']},trained_by:userId}).select('id,status,training_sample_count,project_count,evaluation_metrics,trained_at').single();if(modelError)throw modelError;
    const target=readiness.targetSnapshot;const targetRow=rows.filter(r=>r.project_id===projectId).at(-1);const probability=predictShortfallProbability(finalModel,targetRow.x);const risk=probability>=.7?'CRITICAL':probability>=.5?'HIGH':probability>=.3?'ELEVATED':'LOW';const prediction={shortfallProbabilityPct:round(probability*100),riskLevel:risk,currency:target.currency,asOfDate:target.asOfDate,trainingSampleCount:labeled.length,projectCount:readiness.projectsWithLabels,evaluation:metrics,humanReviewRequired:true,limitations:['Probability is not a guarantee and may be poorly calibrated on a small or changing company dataset.','Forecast applies to the next 30 days only.','Use reconciled bank, receivable, payable and committed-cost evidence; confirm with the finance lead before funding decisions.']};
    const {data:saved,error:predError}=await this.supabase.from('hysmart_cashflow_forecast_predictions').insert({company_id:companyId,project_id:projectId,model_id:model.id,observation_id:target.id,shortfall_probability_pct:prediction.shortfallProbabilityPct,risk_level:risk,currency:target.currency,features:{asOfDate:target.asOfDate,openingCashBalance:target.openingCashBalance,inflowsLast30d:target.inflowsLast30d,outflowsLast30d:target.outflowsLast30d,receivablesDueNext30d:target.receivablesDueNext30d,payablesDueNext30d:target.payablesDueNext30d,minimumCashBuffer:target.minimumCashBuffer},explanation:'Logistic-regression estimate from reconciled project cashflow snapshots. Chronological holdout improved Brier score versus training-period base-rate baseline; finance review required.'}).select('id,shortfall_probability_pct,risk_level,currency,generated_at').single();if(predError)throw predError;
    return {model,readiness,prediction:{...prediction,id:saved.id,generatedAt:saved.generated_at},message:'Cash-shortfall model passed chronological holdout against the base-rate baseline. Review the probability with finance before acting.'};
  }
  async latest({companyId,projectId}){
    const {data:observations,error:obsError}=await this.supabase.from('hysmart_project_cashflow_observations').select('id,as_of_date,currency,reconciliation_status,updated_at').eq('company_id',companyId).eq('project_id',projectId).eq('reconciliation_status','RECONCILED').order('as_of_date',{ascending:false}).limit(1);if(obsError)throw obsError;
    const current=observations?.[0]||null;
    const {data:prediction,error:pe}=await this.supabase.from('hysmart_cashflow_forecast_predictions').select('id,model_id,observation_id,shortfall_probability_pct,risk_level,currency,features,explanation,generated_at').eq('company_id',companyId).eq('project_id',projectId).order('generated_at',{ascending:false}).limit(1).maybeSingle();if(pe)throw pe;
    let model=null;
    if(prediction){const {data,error}=await this.supabase.from('hysmart_cashflow_forecast_models').select('id,model_type,status,training_sample_count,project_count,evaluation_metrics,trained_at').eq('company_id',companyId).eq('id',prediction.model_id).maybeSingle();if(error)throw error;model=data||null;}
    else {const {data,error}=await this.supabase.from('hysmart_cashflow_forecast_models').select('id,model_type,status,training_sample_count,project_count,evaluation_metrics,trained_at').eq('company_id',companyId).eq('model_type',MODEL_TYPE).order('trained_at',{ascending:false}).limit(1).maybeSingle();if(error)throw error;model=data||null;}
    const fresh=!!current&&Date.now()-new Date(current.as_of_date).getTime()<=45*86400000;
    const sameSnapshot=!!prediction&&!!current&&prediction.observation_id===current.id&&new Date(current.updated_at||current.as_of_date)<=new Date(prediction.generated_at);
    const mapped=prediction?{id:prediction.id,shortfallProbabilityPct:Number(prediction.shortfall_probability_pct),riskLevel:prediction.risk_level,currency:prediction.currency,features:prediction.features,explanation:prediction.explanation,generatedAt:prediction.generated_at,observationId:prediction.observation_id,stale:!fresh||!sameSnapshot}:null;
    return {model,prediction:mapped,ready:!!mapped&&model?.status==='READY'&&fresh&&sameSnapshot,stale:!!mapped&&(!fresh||!sameSnapshot),latestSnapshot:current?{id:current.id,asOfDate:current.as_of_date,currency:current.currency}:null};
  }
  async performance({companyId,projectId}){
    let pq=this.supabase.from('hysmart_cashflow_forecast_predictions').select('id,project_id,observation_id,shortfall_probability_pct,currency,generated_at').eq('company_id',companyId).order('generated_at',{ascending:true}).limit(10000);
    if(projectId)pq=pq.eq('project_id',projectId);
    const {data:predictions,error:predictionError}=await pq;if(predictionError)throw predictionError;
    const ids=[...new Set((predictions||[]).map(p=>p.observation_id).filter(Boolean))];
    if(!ids.length)return {companyId,projectId:projectId||null,evaluatedForecastCount:0,metrics:null,verdict:'INSUFFICIENT_EVIDENCE',gaps:['No saved cashflow forecasts are available to score yet.'],guardrail:'Only forecasts generated before the outcome was observed and with a complete 30-day label are evaluated.'};
    const {data:observations,error:observationError}=await this.supabase.from('hysmart_project_cashflow_observations').select('id,project_id,as_of_date,currency,observed_shortfall_next_30d,outcome_observed_at,reconciliation_status').eq('company_id',companyId).in('id',ids).eq('reconciliation_status','RECONCILED');if(observationError)throw observationError;
    const byId=new Map((observations||[]).map(o=>[o.id,o]));
    const now=Date.now();
    const eligiblePredictions=(predictions||[]).flatMap(p=>{const o=byId.get(p.observation_id);if(!o||typeof o.observed_shortfall_next_30d!=='boolean'||!o.outcome_observed_at)return[];const asOf=new Date(o.as_of_date).getTime(),observedAt=new Date(o.outcome_observed_at).getTime(),generatedAt=new Date(p.generated_at).getTime();if(!Number.isFinite(asOf)||!Number.isFinite(observedAt)||!Number.isFinite(generatedAt)||observedAt<asOf+30*86400000||generatedAt>asOf+86400000||observedAt>now)return[];if(p.currency!==o.currency)return[];return[{observationId:o.id,predictionId:p.id,projectId:p.project_id,asOfDate:o.as_of_date,generatedAt,probability:clamp(Number(p.shortfall_probability_pct)/100,0,1),actual:o.observed_shortfall_next_30d?1:0}];});
    const latestPerObservation=new Map();for(const row of eligiblePredictions){const prior=latestPerObservation.get(row.observationId);if(!prior||row.generatedAt>prior.generatedAt)latestPerObservation.set(row.observationId,row);}const scored=[...latestPerObservation.values()];
    const positives=scored.filter(r=>r.actual===1).length, negatives=scored.length-positives, rate=scored.length?positives/scored.length:0;
    const brier=scored.length?mean(scored.map(r=>(r.probability-r.actual)**2)):null;
    const baselineBrier=scored.length?mean(scored.map(r=>(rate-r.actual)**2)):null;
    const bins=Array.from({length:5},(_,i)=>{const low=i/5,high=(i+1)/5;const rows=scored.filter(r=>r.probability>=low&&(i===4?r.probability<=high:r.probability<high));return {band:`${Math.round(low*100)}-${Math.round(high*100)}%`,count:rows.length,meanPredictedProbability:rows.length?round(mean(rows.map(r=>r.probability))):null,observedShortfallRate:rows.length?round(mean(rows.map(r=>r.actual))):null};});
    const eligible=scored.length>=20&&positives>=5&&negatives>=5;
    const gaps=[];if(scored.length<20)gaps.push(`Only ${scored.length} eligible forecasts have verified outcomes; at least 20 are needed for monitoring.`);if(positives<5||negatives<5)gaps.push(`Monitoring requires at least 5 shortfall and 5 no-shortfall outcomes (observed ${positives} and ${negatives}).`);
    let verdict='INSUFFICIENT_EVIDENCE';if(eligible)verdict=brier<baselineBrier?'BEATS_COHORT_BASELINE':'DOES_NOT_BEAT_COHORT_BASELINE';
    return {companyId,projectId:projectId||null,evaluatedForecastCount:scored.length,positiveOutcomes:positives,negativeOutcomes:negatives,metrics:scored.length?{brierScore:round(brier),cohortBaseRateBrierScore:round(baselineBrier),observedShortfallRate:round(rate),meanPredictedProbability:round(mean(scored.map(r=>r.probability))),calibrationBins:bins}:null,verdict,gaps,scoredThrough:scored.length?scored.map(r=>r.asOfDate).sort().at(-1):null,guardrails:['Only reconciled forecasts generated no later than one day after their snapshot and before the verified outcome are scored.','A cohort baseline is descriptive and is not a substitute for a fresh chronological holdout.','Monitoring is withheld when sample size or outcome diversity is inadequate; results do not guarantee future performance.']};
  }
  async scheduledBatch(){const {data:companies,error}=await this.supabase.from('companies').select('id').limit(5000);if(error)throw error;let ready=0,skipped=0,failed=0;for(const c of companies||[]){const {data:projects,error:pe}=await this.supabase.from('projects').select('id,status').eq('company_id',c.id).limit(1000);if(pe){failed++;continue;}for(const p of (projects||[]).filter(p=>!['COMPLETED','CANCELLED'].includes(String(p.status||'').toUpperCase()))){try{const r=await this.trainProject({companyId:c.id,projectId:p.id});if(r.model?.status==='READY')ready++;else skipped++;}catch{failed++;}}}return {ready,skipped,failed};}
}
