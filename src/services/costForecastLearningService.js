const MODEL_TYPE = 'PROJECT_COST_OVERRUN_RIDGE_V1';
const MIN_PROJECTS = 20;
const MIN_PER_CLASS = 5;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(Number(x)) ? Number(x) : 0));
const num = x => Number.isFinite(Number(x)) ? Number(x) : 0;
const round = x => Number(Number(x).toFixed(4));
const avg = xs => xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : 0;
const dot = (a,b) => a.reduce((s,x,i)=>s+x*(b[i]||0),0);

export function costForecastFeatures(row) {
  const budget = Math.max(0, num(row.budget));
  const duration = Math.max(0, num(row.durationMonths));
  return [
    clamp(Math.log1p(budget) / 18, 0, 2),
    clamp(num(row.materialsShare), 0, 1),
    clamp(num(row.labourShare), 0, 1),
    clamp(num(row.commitmentRatio), 0, 3) / 3,
    clamp(num(row.variationRatio), 0, 2) / 2,
    clamp(num(row.deliveryDelayDays) / 90, 0, 2),
    clamp(duration / 36, 0, 3),
    clamp(num(row.quoteCoverage), 0, 1),
    clamp(num(row.productivityIndex) / 3, 0, 1),
    clamp(num(row.productivityCoverage), 0, 1)
  ];
}

// Standardise features on training rows only, preventing holdout leakage.
function fitScaler(rows) {
  const means = rows[0].x.map((_,i)=>avg(rows.map(r=>r.x[i])));
  const scales = rows[0].x.map((_,i)=>Math.sqrt(avg(rows.map(r=>(r.x[i]-means[i])**2))) || 1);
  return { means, scales };
}
function transform(x, scaler) { return x.map((v,i)=>(v-scaler.means[i])/scaler.scales[i]); }
export function fitRidge(rows, lambda=1) {
  const scaler = fitScaler(rows);
  const data = rows.map(r=>({x:transform(r.x,scaler), y:r.y}));
  const d = data[0].x.length + 1;
  const a = Array.from({length:d},()=>Array(d+1).fill(0));
  for (const row of data) {
    const x=[1,...row.x];
    for(let i=0;i<d;i++) { for(let j=0;j<d;j++) a[i][j]+=x[i]*x[j]; a[i][d]+=x[i]*row.y; }
  }
  for(let i=1;i<d;i++) a[i][i]+=lambda;
  // Gauss-Jordan elimination with pivoting for a small, dependency-free regression.
  for(let col=0;col<d;col++) {
    let pivot=col; for(let r=col+1;r<d;r++) if(Math.abs(a[r][col])>Math.abs(a[pivot][col])) pivot=r;
    if(Math.abs(a[pivot][col])<1e-10) continue;
    [a[col],a[pivot]]=[a[pivot],a[col]];
    const div=a[col][col]; for(let j=col;j<=d;j++) a[col][j]/=div;
    for(let r=0;r<d;r++) if(r!==col) { const f=a[r][col]; for(let j=col;j<=d;j++) a[r][j]-=f*a[col][j]; }
  }
  return { weights:a.map(r=>r[d]), scaler, lambda };
}
export function predictOverrun(model, x) { return dot([1,...transform(x,model.scaler)],model.weights); }
export function regressionMetrics(model, rows, baselineMean = avg(rows.map(r=>r.y))) {
  const errors=rows.map(r=>predictOverrun(model,r.x)-r.y);
  return { sampleCount:rows.length, mae:round(avg(errors.map(Math.abs))), rmse:round(Math.sqrt(avg(errors.map(e=>e*e)))), baselineMae:round(avg(rows.map(r=>Math.abs(r.y-baselineMean)))), meanActualOverrunPct:round(avg(rows.map(r=>r.y))*100), meanPredictedOverrunPct:round(avg(rows.map(r=>predictOverrun(model,r.x)))*100) };
}

export class CostForecastLearningService {
  constructor({supabase}) { this.supabase=supabase; }
  async _fetchCompanyEvidence(companyId) {
    const [projectsR, baselinesR, ledgerR, baselineItemsR, ordersR, grnsR, subsR, expensesR, quotationsR, productivityR] = await Promise.all([
      this.supabase.from('projects').select('id,company_id,name,status,currency,budget,start_date,expected_end_date,created_at,updated_at').eq('company_id',companyId).limit(1000),
      this.supabase.from('project_budget_baselines').select('id,project_id,estimate_id,baseline_no,currency,total_budget,status,approved_at').eq('company_id',companyId).eq('status','APPROVED').order('approved_at',{ascending:false}).limit(5000),
      this.supabase.from('project_cost_ledger_v').select('project_id,source_id,source_type,entry_type,amount,currency,entry_date').eq('company_id',companyId).limit(50000),
      this.supabase.from('project_budget_baseline_items').select('baseline_id,category,budget_amount').eq('company_id',companyId).limit(30000),
      this.supabase.from('purchase_orders').select('id,project_id,currency,status,total,order_date,expected_date,created_at,quotation_id').eq('company_id',companyId).not('project_id','is',null).neq('status','CANCELLED').limit(10000),
      this.supabase.from('goods_received_notes').select('purchase_order_id,received_date,status').eq('company_id',companyId).eq('status','POSTED').limit(20000),
      this.supabase.from('project_subcontracts').select('id,project_id').eq('company_id',companyId).limit(10000),
      this.supabase.from('expenses').select('id,supplier_invoice_id,status,project_id').eq('company_id',companyId).not('supplier_invoice_id','is',null).in('status',['APPROVED','PAID']).limit(20000),
      this.supabase.from('purchase_quotations').select('id,status').eq('company_id',companyId).eq('status','ACCEPTED').limit(20000),
      this.supabase.from('project_productivity_records').select('project_id,trade,unit,quantity_completed,labour_hours,work_date').eq('company_id',companyId).limit(50000)
    ]);
    for (const r of [projectsR,baselinesR,ledgerR,baselineItemsR,ordersR,grnsR,subsR,expensesR,quotationsR,productivityR]) if(r.error) throw r.error;
    const projects=projectsR.data||[], baselines=baselinesR.data||[], ledger=ledgerR.data||[], items=baselineItemsR.data||[], orders=ordersR.data||[], grns=grnsR.data||[], subs=subsR.data||[], expenses=expensesR.data||[], acceptedQuotations=new Set((quotationsR.data||[]).map(q=>q.id)), productivityRows=productivityR.data||[];
    const invoiceIdsInLedger=new Set(ledger.filter(l=>String(l.source_type||'').toUpperCase()==='SUPPLIER_INVOICE').map(l=>l.source_id));
    const mirroredExpenseIds=new Set(expenses.filter(e=>e.supplier_invoice_id&&invoiceIdsInLedger.has(e.supplier_invoice_id)).map(e=>e.id));
    const latestBaseline=new Map(); for(const b of baselines) if(!latestBaseline.has(b.project_id)) latestBaseline.set(b.project_id,b);
    const itemAgg=new Map(); for(const it of items){const v=itemAgg.get(it.baseline_id)||{materials:0,labour:0,total:0};const amount=num(it.budget_amount);v.total+=amount;if(String(it.category).toUpperCase().includes('MATERIAL'))v.materials+=amount;if(String(it.category).toUpperCase().includes('LABOUR'))v.labour+=amount;itemAgg.set(it.baseline_id,v);}
    const ledgerAgg=new Map(); for(const l of ledger){if(String(l.source_type||'').toUpperCase()==='EXPENSE'&&mirroredExpenseIds.has(l.source_id))continue;const k=l.project_id;const v=ledgerAgg.get(k)||{actual:0,commitment:0,currencyAmounts:new Map()};const type=String(l.entry_type||'').toUpperCase();const c=String(l.currency||'').toUpperCase();const amount=num(l.amount);v.currencyAmounts.set(c,(v.currencyAmounts.get(c)||0)+amount);if(type==='ACTUAL')v.actual+=amount;if(type==='COMMITMENT')v.commitment+=amount;ledgerAgg.set(k,v);}
    const poAgg=new Map(); for(const o of orders){const v=poAgg.get(o.project_id)||{total:0,count:0,quoted:0,expected:[],orderIds:[]};v.total+=num(o.total);v.count++;if(o.quotation_id&&acceptedQuotations.has(o.quotation_id))v.quoted++;if(o.expected_date)v.expected.push(o.expected_date);v.orderIds.push(o.id);poAgg.set(o.project_id,v);}
    const receivedByOrder=new Map(); for(const g of grns){if(!g.purchase_order_id||!g.received_date)continue;const list=receivedByOrder.get(g.purchase_order_id)||[];list.push(g.received_date);receivedByOrder.set(g.purchase_order_id,list);}
    const productivityGroupStats=new Map(); const productivityProjectStats=new Map();
    for(const pr of productivityRows){const hours=num(pr.labour_hours),qty=num(pr.quantity_completed);if(hours<=0||qty<0)continue;const group=`${String(pr.trade||'UNSPECIFIED').trim().toUpperCase()}|${String(pr.unit||'UNSPECIFIED').trim().toUpperCase()}`;const all=productivityGroupStats.get(group)||{quantity:0,hours:0};all.quantity+=qty;all.hours+=hours;productivityGroupStats.set(group,all);const key=`${pr.project_id}|${group}`;const local=productivityProjectStats.get(key)||{projectId:pr.project_id,group,quantity:0,hours:0};local.quantity+=qty;local.hours+=hours;productivityProjectStats.set(key,local);}
    const productivityByProject=new Map();for(const local of productivityProjectStats.values()){const company=productivityGroupStats.get(local.group);const companyRate=company&&company.hours>0?company.quantity/company.hours:0;const localRate=local.hours>0?local.quantity/local.hours:0;if(companyRate<=0)continue;const v=productivityByProject.get(local.projectId)||{ratios:[],hours:0,groups:0};v.ratios.push(localRate/companyRate);v.hours+=local.hours;v.groups++;productivityByProject.set(local.projectId,v);}
    const variationsByProject=new Map(); if(subs.length){const vr=await this.supabase.from('project_subcontract_variations').select('subcontract_id,amount,status,approved_at').eq('company_id',companyId).eq('status','APPROVED').limit(20000);if(vr.error)throw vr.error;const projectBySub=new Map(subs.map(s=>[s.id,s.project_id]));for(const v of vr){const pid=projectBySub.get(v.subcontract_id);if(!pid)continue;variationsByProject.set(pid,(variationsByProject.get(pid)||0)+num(v.amount));}}
    return projects.map(p=>{
      const b=latestBaseline.get(p.id);const base=Math.max(0,num(b?.total_budget||p.budget));const led=ledgerAgg.get(p.id)||{actual:0,commitment:0,currencyAmounts:new Map()};const currency=String(b?.currency||p.currency||'').toUpperCase();
      const currencyMismatch=[...led.currencyAmounts.entries()].some(([c,a])=>c&&c!==currency&&a!==0);
      const actual=currencyMismatch?null:led.actual;const commitment=currencyMismatch?null:led.commitment;
      const cat=itemAgg.get(b?.id)||{materials:0,labour:0,total:0};const pos=poAgg.get(p.id)||{total:0,count:0,quoted:0,expected:[],orderIds:[]};
      const variation=variationsByProject.get(p.id)||0;const productivity=productivityByProject.get(p.id)||{ratios:[],hours:0,groups:0};
      const durationMonths=p.start_date&&p.expected_end_date?Math.max(0,(new Date(p.expected_end_date)-new Date(p.start_date))/(86400000*30.4375)):0;
      const delays=[];for(const po of orders.filter(o=>o.project_id===p.id)){const rec=receivedByOrder.get(po.id)||[];if(po.expected_date&&rec.length){const actualDate=rec.sort()[rec.length-1];delays.push(Math.max(-60,Math.min(365,(new Date(actualDate)-new Date(po.expected_date))/86400000)));}}
      const quoteCoverage=pos.count>0?pos.quoted/pos.count:0;
      const row={projectId:p.id,projectName:p.name,status:p.status,currency,budget:base,actualCost:actual,commitmentCost:commitment,materialsShare:cat.total>0?cat.materials/cat.total:0,labourShare:cat.total>0?cat.labour/cat.total:0,commitmentRatio:base>0?Math.max(0,num(commitment))/base:0,variationRatio:base>0?variation/base:0,deliveryDelayDays:avg(delays),durationMonths,quoteCoverage,productivityIndex:avg(productivity.ratios),productivityCoverage:Math.min(1,productivity.groups/3),productivityHours:productivity.hours,productivityGroups:productivity.groups,baselineId:b?.id||null,baselineStatus:b?.status||null,hasActualEvidence:actual!==null&&actual>0,hasBudgetEvidence:base>0,currencyMismatch,procurementOrderCount:pos.count,deliveryObservations:delays.length,approvedVariationValue:variation,orderCommitment:pos.total,sortDate:p.expected_end_date||p.updated_at||p.created_at};
      row.x=costForecastFeatures(row);row.y=base>0&&actual!==null&&actual>0?(actual-base)/base:null;return row;
    });
  }
  async readiness({companyId,projectId}) {
    const rows=await this._fetchCompanyEvidence(companyId);const target=rows.find(r=>r.projectId===projectId);const historical=rows.filter(r=>String(r.status||'').toUpperCase()==='COMPLETED'&&r.y!==null&&r.hasBudgetEvidence&&!r.currencyMismatch).sort((a,b)=>String(a.sortDate).localeCompare(String(b.sortDate)));
    const overrun=historical.filter(r=>r.y>0.03).length, within=historical.filter(r=>r.y<=0.03).length;
    const gaps=[];if(!target)gaps.push('Project was not found in the company dataset.');else{if(!target.hasBudgetEvidence)gaps.push('No approved budget baseline or project budget exists.');if(!target.hasActualEvidence)gaps.push('No positive actual-cost ledger evidence exists yet.');if(target.currencyMismatch)gaps.push('Ledger has mixed currencies; reconcile before comparing costs.');if(target.deliveryObservations===0)gaps.push('No posted goods-received records linked to expected delivery dates.');if(target.productivityGroups===0)gaps.push('No labour productivity records with positive labour hours are available.');if(target.procurementOrderCount===0)gaps.push('No project-linked purchase orders found.');}
    if(historical.length<MIN_PROJECTS)gaps.push(`Only ${historical.length} completed projects have matched budget and actual-cost evidence; ${MIN_PROJECTS} are required for training.`);
    if(overrun<MIN_PER_CLASS||within<MIN_PER_CLASS)gaps.push(`Historical outcome classes are imbalanced or too small (overrun=${overrun}, within-budget=${within}; at least ${MIN_PER_CLASS} each).`);
    return {companyId,projectId,historicalSampleCount:historical.length,overrunProjects:overrun,withinBudgetProjects:within,trainingEligible:historical.length>=MIN_PROJECTS&&overrun>=MIN_PER_CLASS&&within>=MIN_PER_CLASS,targetProjectEvidence:target?{hasBudgetEvidence:target.hasBudgetEvidence,hasActualEvidence:target.hasActualEvidence,currencyMismatch:target.currencyMismatch,procurementOrderCount:target.procurementOrderCount,deliveryObservations:target.deliveryObservations,productivityGroups:target.productivityGroups,productivityIndex:round(target.productivityIndex),approvedVariationValue:target.approvedVariationValue}:null,gaps,guardrails:['Only completed projects with matching currencies, an approved budget or project budget, and positive actual-cost ledger evidence are training labels.','Features are derived from approved BOQ budget categories, project-linked purchase orders, posted goods-received dates, approved subcontract variations, and project duration.','Cash-shortfall model is not marked trained: historical dated cash-in/cash-out series are not yet stored consistently enough to label true cash-shortfall outcomes.']};
  }
  async trainProject({companyId,projectId,userId=null}) {
    const readiness=await this.readiness({companyId,projectId});const all=await this._fetchCompanyEvidence(companyId);const history=all.filter(r=>String(r.status||'').toUpperCase()==='COMPLETED'&&r.y!==null&&r.hasBudgetEvidence&&!r.currencyMismatch).sort((a,b)=>String(a.sortDate).localeCompare(String(b.sortDate)));
    if(!readiness.trainingEligible){const {data,error}=await this.supabase.from('hysmart_cost_forecast_models').insert({company_id:companyId,project_id:projectId,model_type:MODEL_TYPE,status:'INSUFFICIENT_DATA',training_sample_count:history.length,evaluation_metrics:{readiness},parameters:{},trained_by:userId}).select('id,status,training_sample_count,evaluation_metrics,trained_at').single();if(error)throw error;return {model:data,readiness,prediction:null,message:'No trained-model forecast is published until historical data-quality and sample-size gates pass.'};}
    const split=Math.max(1,Math.floor(history.length*.8));const train=history.slice(0,split),test=history.slice(split).map(r=>({x:r.x,y:r.y}));
    if(!test.length)return {model:null,readiness:{...readiness,trainingEligible:false,gaps:[...readiness.gaps,'Chronological holdout set is empty.']},prediction:null};
    const evaluationModel=fitRidge(train.map(r=>({x:r.x,y:r.y})));const metrics=regressionMetrics(evaluationModel,test,avg(train.map(r=>r.y)));
    const improvesBaseline=metrics.mae<=metrics.baselineMae;
    const target=all.find(r=>r.projectId===projectId);const now=new Date().toISOString();
    if(!target?.hasBudgetEvidence||target.currencyMismatch){return {model:null,readiness:{...readiness,trainingEligible:false,gaps:[...readiness.gaps,...(!target?.hasBudgetEvidence?['Target project has no positive approved budget/project budget.']:[]),...(target?.currencyMismatch?['Target project has mixed-currency cost evidence; trained forecast withheld.']:[])]},prediction:null,message:'Target project budget/currency evidence must be reconciled before publishing a forecast.'};}
    if(!improvesBaseline){const {data,error}=await this.supabase.from('hysmart_cost_forecast_models').insert({company_id:companyId,project_id:projectId,model_type:MODEL_TYPE,status:'EVALUATION_FAILED',training_sample_count:history.length,evaluation_metrics:{chronologicalHoldout:metrics,holdoutStart:test[0]&&history[split]?.sortDate||null,beatsNaiveBaseline:false},parameters:{},trained_by:userId,trained_at:now}).select('id,status,training_sample_count,evaluation_metrics,trained_at').single();if(error)throw error;return {model:data,readiness,prediction:null,message:'The model did not outperform a simple historical-average baseline on later projects. No trained forecast is published.'};}
    const finalModel=fitRidge(history.map(r=>({x:r.x,y:r.y})));const overrun=history.filter(r=>r.y>0.03).length;const predictedRatio=clamp(predictOverrun(finalModel,target.x),-0.5,2.5);const expectedFinalCost=target.budget*(1+predictedRatio);const prediction={modelType:MODEL_TYPE,expectedOverrunPct:round(predictedRatio*100),expectedFinalCost:round(expectedFinalCost),budget:round(target.budget),predictedVarianceAmount:round(expectedFinalCost-target.budget),riskLevel:predictedRatio>=.15?'HIGH':predictedRatio>=.05?'MEDIUM':predictedRatio>0?'LOW':'WITHIN_BUDGET',currency:target.currency,trainingSampleCount:history.length,evaluation:metrics,humanReviewRequired:true,limitations:['Model predicts cost variance relative to approved budget; it does not replace a current BOQ or QS review.','No calibrated statistical prediction interval is available yet.','Cash-shortfall forecast remains rules-based until monthly cash-in/cash-out history is consistently captured.']};
    const {data:model,error:modelError}=await this.supabase.from('hysmart_cost_forecast_models').insert({company_id:companyId,project_id:projectId,model_type:MODEL_TYPE,status:'READY',training_sample_count:history.length,class_counts:{overrun,withinBudget:history.length-overrun},evaluation_metrics:{chronologicalHoldout:metrics,holdoutStart:history[split]?.sortDate||null,beatsNaiveBaseline:true,evaluationMethod:'Chronological 80/20 holdout; scaler fit on train split only; MAE compared with training-mean baseline.'},parameters:{weights:finalModel.weights,scaler:finalModel.scaler,lambda:finalModel.lambda,featureNames:['log_budget','materials_share','labour_share','commitment_ratio','approved_variation_ratio','delivery_delay_days','duration_months','accepted_quotation_coverage','labour_productivity_index','labour_productivity_coverage'],target:'actual_cost_minus_approved_budget_over_approved_budget'},trained_by:userId,trained_at:now}).select('id,status,training_sample_count,class_counts,evaluation_metrics,trained_at').single();if(modelError)throw modelError;
    const {error:predError}=await this.supabase.from('hysmart_cost_forecast_predictions').insert({company_id:companyId,project_id:projectId,model_id:model.id,expected_final_cost:prediction.expectedFinalCost,expected_overrun_pct:prediction.expectedOverrunPct,predicted_variance_amount:prediction.predictedVarianceAmount,risk_level:prediction.riskLevel,currency:prediction.currency,features:{budget:target.budget,materialsShare:target.materialsShare,labourShare:target.labourShare,commitmentRatio:target.commitmentRatio,variationRatio:target.variationRatio,deliveryDelayDays:target.deliveryDelayDays,durationMonths:target.durationMonths,quoteCoverage:target.quoteCoverage},explanation:'Ridge-regression estimate from completed company projects; chronological holdout beat the historical-average baseline. Human review required.',generated_at:now});if(predError)throw predError;
    return {model,readiness,prediction,message:'Cost-overrun model passed chronological holdout against a naive baseline. Treat as decision support, not a guarantee.'};
  }
  async latest({companyId,projectId}) {
    const {data:model,error}=await this.supabase.from('hysmart_cost_forecast_models').select('id,model_type,status,training_sample_count,class_counts,evaluation_metrics,trained_at').eq('company_id',companyId).eq('project_id',projectId).eq('model_type',MODEL_TYPE).order('trained_at',{ascending:false}).limit(1).maybeSingle();if(error)throw error;
    const {data:prediction,error:pe}=model?.status==='READY'?await this.supabase.from('hysmart_cost_forecast_predictions').select('expected_final_cost,expected_overrun_pct,predicted_variance_amount,risk_level,currency,features,explanation,generated_at').eq('company_id',companyId).eq('project_id',projectId).eq('model_id',model.id).maybeSingle():{data:null,error:null};if(pe)throw pe;
    return {model:model||null,prediction:prediction||null,ready:model?.status==='READY'};
  }
}
