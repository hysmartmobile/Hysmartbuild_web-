import { randomUUID } from 'node:crypto';

const DAY=86400000;
const fmt=d=>new Date(d).toISOString().slice(0,10);
const iso=s=>new Date(`${s}T00:00:00Z`).getTime();
const days=(a,b)=>Math.round((iso(b)-iso(a))/DAY);
const n=v=>Number(v||0);

export class ExecutionService {
  constructor({supabase}){this.supabase=supabase;}
  async assertProject(companyId,projectId){
    const {data,error}=await this.supabase.from('projects').select('id,company_id,name,currency,budget,contract_value,progress,start_date,expected_end_date').eq('company_id',companyId).eq('id',projectId).maybeSingle();
    if(error)throw error;if(!data){const e=new Error('Project not found');e.code='PROJECT_NOT_FOUND';e.status=404;throw e;}return data;
  }
  async approvedBudget(companyId,projectId){
    const {data,error}=await this.supabase.from('project_budget_baselines').select('total_budget,currency').eq('company_id',companyId).eq('project_id',projectId).eq('status','APPROVED').order('approved_at',{ascending:false}).limit(1).maybeSingle();
    if(error)throw error;return data;
  }
  async schedule(companyId,projectId){
    const [a,d,b]=await Promise.all([
      this.supabase.from('project_schedule_activities').select('id,activity_code,name,planned_start,planned_finish,actual_start,actual_finish,status,percent_complete,progress_weight,estimate_item_id,planned_quantity,unit,planned_value,is_critical,total_float_days,schedule_variance_days,forecast_finish,cost_code').eq('company_id',companyId).eq('project_id',projectId),
      this.supabase.from('project_schedule_dependencies').select('id,predecessor_id,successor_id,dependency_type,lag_days').eq('company_id',companyId).eq('project_id',projectId),
      this.supabase.from('project_schedule_baselines').select('id,baseline_no,status').eq('company_id',companyId).eq('project_id',projectId).eq('status','APPROVED').order('baseline_no',{ascending:false}).limit(1).maybeSingle()
    ]);if(a.error)throw a.error;if(d.error)throw d.error;if(b.error)throw b.error;return {activities:a.data||[],dependencies:d.data||[],baseline:b.data||null};
  }
  async boqs(companyId,projectId){
    const {data,error}=await this.supabase.from('project_estimates').select('id,status,total_amount,project_estimate_items(id,description,quantity,unit,unit_rate,line_total)').eq('company_id',companyId).eq('project_id',projectId).eq('status','APPROVED').order('version_no',{ascending:false}).limit(1).maybeSingle();
    if(error)throw error;return data?.project_estimate_items||[];
  }
  async latestMeasurements(companyId,projectId){
    const {data,error}=await this.supabase.from('project_progress_measurements').select('id,estimate_item_id,measurement_date,quantity_completed,percent_complete,measured_value,status').eq('company_id',companyId).eq('project_id',projectId).eq('status','APPROVED').order('measurement_date',{ascending:false});
    if(error)throw error;const map=new Map();for(const x of data||[]){if(x.estimate_item_id&&!map.has(x.estimate_item_id))map.set(x.estimate_item_id,x);}return map;
  }
  async costs(companyId,projectId){
    const {data,error}=await this.supabase.from('project_cost_ledger_v').select('entry_type,amount,entry_date,source_type').eq('company_id',companyId).eq('project_id',projectId);if(error)throw error;
    const rows=data||[];return {committed:rows.filter(x=>x.entry_type==='COMMITMENT').reduce((s,x)=>s+n(x.amount),0),actual:rows.filter(x=>x.entry_type==='ACTUAL').reduce((s,x)=>s+n(x.amount),0)};
  }
  async cash(companyId,projectId){
    const [ar,sp]=await Promise.all([
      this.supabase.from('accounts_receivable_invoices').select('id,total,amount_paid,status,due_date,invoice_date,currency').eq('company_id',companyId).eq('project_id',projectId).in('status',['ISSUED','PARTIALLY_PAID','PAID']),
      this.supabase.from('supplier_invoices').select('id,total,amount_paid,status,due_date,purchase_orders!supplier_invoices_po_tenant_fk!inner(project_id)').eq('company_id',companyId).eq('purchase_orders.project_id',projectId).in('status',['RECEIVED','APPROVED','PARTIALLY_PAID','PAID'])
    ]);if(ar.error)throw ar.error;if(sp.error)throw sp.error;
    const receivables=ar.data||[], payables=sp.data||[];const outstandingAR=receivables.reduce((s,x)=>s+Math.max(0,n(x.total)-n(x.amount_paid)),0);const collected=receivables.reduce((s,x)=>s+n(x.amount_paid),0);const outstandingAP=payables.reduce((s,x)=>s+Math.max(0,n(x.total)-n(x.amount_paid)),0);const paidAP=payables.reduce((s,x)=>s+n(x.amount_paid),0);
    const today=fmt(new Date());return {billed:receivables.reduce((s,x)=>s+n(x.total),0),collected,outstandingReceivables:outstandingAR,committedPayables:payables.reduce((s,x)=>s+n(x.total),0),paidPayables:paidAP,outstandingPayables:outstandingAP,netCashExposure:outstandingAR-outstandingAP,overdueReceivables:receivables.filter(x=>x.due_date&&x.due_date<today&&n(x.total)>n(x.amount_paid)).reduce((s,x)=>s+Math.max(0,n(x.total)-n(x.amount_paid)),0),overduePayables:payables.filter(x=>x.due_date&&x.due_date<today&&n(x.total)>n(x.amount_paid)).reduce((s,x)=>s+Math.max(0,n(x.total)-n(x.amount_paid)),0)};
  }
  async materials(companyId,projectId){
    const {data,error}=await this.supabase.from('inventory_transactions').select('material_id,transaction_type,quantity,materials(name,unit,reorder_level)').eq('company_id',companyId).eq('project_id',projectId).order('created_at',{ascending:false}).limit(5000);if(error)throw error;
    const by=new Map();for(const x of data||[]){const key=x.material_id;const r=by.get(key)||{materialId:key,name:x.materials?.name||'Material',unit:x.materials?.unit||'',reorderLevel:n(x.materials?.reorder_level),issued:0,received:0};if(x.transaction_type==='ISSUE')r.issued+=n(x.quantity);if(x.transaction_type==='RECEIPT')r.received+=n(x.quantity);by.set(key,r);}return [...by.values()].map(x=>({...x,netReceived:x.received-x.issued,belowReorder:x.received-x.issued<=x.reorderLevel}));
  }
  async dashboard({companyId,projectId,saveSnapshot=false,userId=null}){
    const project=await this.assertProject(companyId,projectId);const [sch,boq,measurements,cost,cash,materials,budget]=await Promise.all([this.schedule(companyId,projectId),this.boqs(companyId,projectId),this.latestMeasurements(companyId,projectId),this.costs(companyId,projectId),this.cash(companyId,projectId),this.materials(companyId,projectId),this.approvedBudget(companyId,projectId)]);
    const approvedBudget=n(budget?.total_budget)||n(project.budget)||n(project.contract_value);
    const boqMap=new Map(boq.map(x=>[x.id,x]));
    let pv=0,ev=0,weightTotal=0,actualProgress=0;
    const today=fmt(new Date());
    for(const a of sch.activities){
      const weight=n(a.progress_weight)||1;weightTotal+=weight;actualProgress+=weight*n(a.percent_complete)/100;
      const item=boqMap.get(a.estimate_item_id);const value=n(a.planned_value)||n(item?.line_total);const start=a.planned_start,finish=a.planned_finish;
      const plannedPct=today<start?0:today>=finish?1:Math.max(0,Math.min(1,(iso(today)-iso(start))/(iso(finish)-iso(start)+DAY)));
      pv+=value*plannedPct;
      const measured=measurements.get(a.estimate_item_id);const earned=item&&measured?Math.min(n(item.quantity),n(measured.quantity_completed))*n(item.unit_rate):value*n(a.percent_complete)/100;ev+=earned;
    }
    if(!pv&&!ev&&approvedBudget){pv=approvedBudget*(actualProgress/(weightTotal||1));ev=approvedBudget*(actualProgress/(weightTotal||1));}
    const plannedProgress=sch.activities.reduce((s,a)=>{const w=n(a.progress_weight)||1;const p=today<a.planned_start?0:today>=a.planned_finish?1:Math.max(0,Math.min(1,(iso(today)-iso(a.planned_start))/(iso(a.planned_finish)-iso(a.planned_start)+DAY)));return s+w*p;},0)/(weightTotal||1)*100;
    const actualPct=weightTotal?actualProgress/weightTotal*100:n(project.progress);const spi=pv>0?ev/pv:null;const cpi=cost.actual>0?ev/cost.actual:null;const forecastCost=cpi&&cpi>0?Math.max(approvedBudget,ev/cpi):null;
    const incomplete=sch.activities.filter(a=>n(a.percent_complete)<100);const plannedFinish=sch.activities.map(a=>a.planned_finish).filter(Boolean).sort().pop()||project.expected_end_date;const forecastFinish=sch.activities.map(a=>a.forecast_finish||a.planned_finish).filter(Boolean).sort().pop()||plannedFinish;const scheduleVariance=forecastFinish&&plannedFinish?days(plannedFinish,forecastFinish):0;
    const alerts=[];
    if(spi!==null&&spi<0.9)alerts.push({severity:'HIGH',code:'SCHEDULE_PERFORMANCE',title:'Programme is behind plan',message:`Schedule performance is ${(spi*100).toFixed(0)}% of plan. Review critical and delayed activities.`});
    if(cpi!==null&&cpi<0.9)alerts.push({severity:'HIGH',code:'COST_PERFORMANCE',title:'Cost efficiency is deteriorating',message:`Earned value is ${(cpi*100).toFixed(0)}% of actual cost. Investigate cost overruns.`});
    const criticalDelayed=sch.activities.filter(a=>a.is_critical&&n(a.schedule_variance_days)>0).length;if(criticalDelayed)alerts.push({severity:'CRITICAL',code:'CRITICAL_DELAY',title:'Critical-path activities are delayed',message:`${criticalDelayed} critical activity(ies) have schedule variance.`});
    const lowMaterials=materials.filter(x=>x.belowReorder);if(lowMaterials.length)alerts.push({severity:'MEDIUM',code:'MATERIAL_RISK',title:'Material availability risk',message:`${lowMaterials.length} material position(s) are at or below reorder level.`});
    if(cash.overdueReceivables>0)alerts.push({severity:'HIGH',code:'OVERDUE_RECEIVABLE',title:'Cash collection is overdue',message:`${cash.overdueReceivables.toLocaleString()} remains overdue from project receivables.`});
    if(cash.outstandingPayables>0&&cash.outstandingReceivables<cash.outstandingPayables)alerts.push({severity:'MEDIUM',code:'CASH_EXPOSURE',title:'Supplier exposure exceeds project receivables',message:`Outstanding supplier exposure is greater than outstanding project receivables.`});
    const result={project,financial:{approvedBudget,plannedValue:pv,earnedValue:ev,actualCost:cost.actual,committedCost:cost.committed,costVariance:approvedBudget-cost.actual,forecastCost,schedulePerformanceIndex:spi,costPerformanceIndex:cpi},progress:{plannedPercent:Number(plannedProgress.toFixed(2)),actualPercent:Number(actualPct.toFixed(2)),variancePercent:Number((actualPct-plannedProgress).toFixed(2))},schedule:{plannedFinish,forecastFinish,varianceDays:scheduleVariance,criticalCount:sch.activities.filter(a=>a.is_critical).length,delayedCount:sch.activities.filter(a=>n(a.schedule_variance_days)>0).length,incompleteCount:incomplete.length},cash,materials,alerts,generatedAt:new Date().toISOString()};
    if(saveSnapshot){await this.supabase.from('project_execution_snapshots').upsert({id:randomUUID(),company_id:companyId,project_id:projectId,snapshot_date:today,planned_value:pv,earned_value:ev,actual_cost:cost.actual,committed_cost:cost.committed,schedule_index:spi,cost_index:cpi,forecast_cost:forecastCost,forecast_finish:forecastFinish,schedule_variance_days:scheduleVariance,cost_variance:approvedBudget-cost.actual,progress_percent:actualPct,created_by:userId||null},{onConflict:'company_id,project_id,snapshot_date'});}
    return result;
  }
  async snapshots({companyId,projectId}){const {data,error}=await this.supabase.from('project_execution_snapshots').select('*').eq('company_id',companyId).eq('project_id',projectId).order('snapshot_date',{ascending:false}).limit(90);if(error)throw error;return data||[];}
  async alerts({companyId,projectId}){return (await this.dashboard({companyId,projectId})).alerts;}
  async createMeasurement({companyId,projectId,userId,input}){await this.assertProject(companyId,projectId);const {data:item,error:ie}=await this.supabase.from('project_estimate_items').select('id,quantity,unit,unit_rate,line_total,project_estimates!inner(project_id,status)').eq('company_id',companyId).eq('id',input.estimateItemId).eq('project_estimates.project_id',projectId).eq('project_estimates.status','APPROVED').maybeSingle();if(ie)throw ie;if(!item){const e=new Error('Estimate item not found for this company');e.code='ESTIMATE_ITEM_NOT_FOUND';e.status=404;throw e;}if(n(input.quantityCompleted)>n(item.quantity)){const e=new Error('Measured quantity exceeds BOQ quantity');e.code='MEASURED_QUANTITY_OVER_LIMIT';e.status=409;throw e;}const percent=n(item.quantity)>0?Math.min(100,n(input.quantityCompleted)/n(item.quantity)*100):0;const {data,error}=await this.supabase.from('project_progress_measurements').insert({id:randomUUID(),company_id:companyId,project_id:projectId,estimate_item_id:item.id,measurement_date:input.measurementDate||fmt(new Date()),quantity_completed:n(input.quantityCompleted),percent_complete:percent,measured_value:n(input.quantityCompleted)*n(item.unit_rate),location:input.location||null,notes:input.notes||null,measured_by:userId,status:'SUBMITTED'}).select().single();if(error)throw error;return data;}
}
