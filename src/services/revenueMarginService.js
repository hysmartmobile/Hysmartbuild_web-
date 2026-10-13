import { randomUUID } from 'node:crypto';
const n=v=>Number(v||0); const r=v=>Math.round(n(v)*100)/100;
const sum=(rows,key)=> (rows||[]).reduce((s,x)=>s+n(x?.[key]),0);

export class RevenueMarginService {
  constructor({supabase}){this.supabase=supabase;}
  async analyze({companyId,projectId=null}){
    let pq=this.supabase.from('projects').select('id,name,code,contract_value,budget,currency,status').eq('company_id',companyId);
    if(projectId)pq=pq.eq('id',projectId);
    const {data:projects,error:pe}=await pq.order('name'); if(pe)throw pe;
    const rows=[];
    for(const p of projects||[]) rows.push(await this.project(companyId,p));
    const events=await this.events({companyId,projectId});
    return {generatedAt:new Date().toISOString(),summary:this.summary(rows,events),projects:rows,events};
  }
  async project(companyId,p){
    const id=p.id;
    const [co,ar,ipc,meas,cost,po,si,mat,prod,rfis,risks]=await Promise.all([
      this.supabase.from('project_change_orders').select('id,title,amount,cost_impact,status,requested_date,approved_date').eq('company_id',companyId).eq('project_id',id),
      this.supabase.from('accounts_receivable_invoices').select('id,invoice_no,total,amount_paid,status,due_date').eq('company_id',companyId).eq('project_id',id).neq('status','VOID'),
      this.supabase.from('project_client_ipcs').select('id,ipc_no,gross_valuation,current_gross,net_amount,status,invoice_id').eq('company_id',companyId).eq('project_id',id),
      this.supabase.from('project_progress_measurements').select('estimate_item_id,quantity_completed,measured_value,status').eq('company_id',companyId).eq('project_id',id).eq('status','APPROVED'),
      this.supabase.from('project_cost_ledger_v').select('entry_type,amount,source_type').eq('company_id',companyId).eq('project_id',id),
      this.supabase.from('purchase_orders').select('id,total,status,expected_date').eq('company_id',companyId).eq('project_id',id).neq('status','CANCELLED'),
      this.supabase.from('supplier_invoices').select('id,total,amount_paid,status,due_date,purchase_order_id,purchase_order:purchase_orders!supplier_invoices_po_tenant_fk!inner(project_id)').eq('company_id',companyId).eq('purchase_order.project_id',id).neq('status','VOID'),
      this.supabase.from('project_material_plans').select('id,status,required_by,planned_quantity').eq('company_id',companyId).eq('project_id',id),
      this.supabase.from('project_productivity_records').select('work_date,quantity_completed,labour_hours,worker_count').eq('company_id',companyId).eq('project_id',id).order('work_date',{ascending:false}).limit(30),
      this.supabase.from('project_rfis').select('id,status,due_date').eq('company_id',companyId).eq('project_id',id),
      this.supabase.from('project_risks').select('id,status,probability,impact').eq('company_id',companyId).eq('project_id',id)
    ]);
    for(const x of [co,ar,ipc,meas,cost,po,si,mat,prod,rfis,risks])if(x.error)throw x.error;
    const change=co.data||[], invoices=ar.data||[], ipcs=ipc.data||[], measurements=meas.data||[], costs=cost.data||[], pos=po.data||[], supplierInvoices=si.data||[], materials=mat.data||[], productivity=prod.data||[], rfiRows=rfis.data||[], riskRows=risks.data||[];
    const approvedVariations=sum(change.filter(x=>x.status==='APPROVED'),'amount');
    const pendingVariations=sum(change.filter(x=>['DRAFT','SUBMITTED'].includes(x.status)),'amount');
    const baseContract=n(p.contract_value)||sum(ipcs.filter(x=>x.status==='APPROVED'),'gross_valuation')||n(p.budget);
    const revisedContract=baseContract+approvedVariations;
    const earned=sum(measurements,'measured_value');
    const billed=sum(invoices,'total');
    const outstanding=invoices.reduce((s,x)=>s+Math.max(0,n(x.total)-n(x.amount_paid)),0);
    const actualCost=sum(costs.filter(x=>x.entry_type==='ACTUAL'),'amount');
    const committedCost=sum(costs.filter(x=>x.entry_type==='COMMITMENT'),'amount');
    const forecastCost=Math.max(actualCost,committedCost,actualCost+(committedCost>actualCost?committedCost-actualCost:0));
    const baselineMargin=baseContract-n(p.budget||baseContract);
    const forecastMargin=revisedContract-forecastCost;
    const marginLeakage=Math.max(0,baselineMargin-forecastMargin);
    const unbilledWork=Math.max(0,earned-billed);
    const revenueRecovery=unbilledWork+pendingVariations;
    const overdueReceivables=invoices.reduce((s,x)=>{const d=x.due_date?Math.max(0,Math.floor((Date.now()-new Date(x.due_date).getTime())/86400000)):0;return s+(d>0?Math.max(0,n(x.total)-n(x.amount_paid)):0)},0);
    const openSupplierExposure=supplierInvoices.reduce((s,x)=>s+Math.max(0,n(x.total)-n(x.amount_paid)),0);
    const materialRisk=materials.filter(x=>x.required_by&&new Date(x.required_by)<new Date()&&!['RECEIVED','COMPLETED','CANCELLED'].includes(x.status)).length;
    // The persisted schema records completed quantity and labour hours, not a productivity_index.
    // Compare observed output/hour against the project's median rate instead of querying invented columns.
    const productivityRates=productivity.map(x=>n(x.labour_hours)>0?n(x.quantity_completed)/n(x.labour_hours):null).filter(x=>x!==null&&Number.isFinite(x)&&x>0).sort((a,b)=>a-b);
    const medianRate=productivityRates.length?productivityRates[Math.floor((productivityRates.length-1)/2)]:0;
    const lowProductivity=medianRate>0?productivity.filter(x=>n(x.labour_hours)>0&&n(x.quantity_completed)>0&&(n(x.quantity_completed)/n(x.labour_hours))<medianRate*0.85).length:0;
    const overdueRfis=rfiRows.filter(x=>x.due_date&&new Date(x.due_date)<new Date()&&!['CLOSED','RESPONDED'].includes(x.status)).length;
    const highRisks=riskRows.filter(x=>x.status!=='CLOSED'&&n(x.probability)*n(x.impact)>=12).length;
    const recommendations=[]; const add=(type,priority,title,reason,action,value,unit,evidence,confidence)=>recommendations.push({id:randomUUID(),type,priority,title,reason,action,targetValue:r(value),unit,evidence,confidence});
    if(unbilledWork>0) add('REVENUE','NOW','Capture completed but unbilled work',`Approved measured work of ${r(earned).toLocaleString()} is ahead of invoiced value by ${r(unbilledWork).toLocaleString()}.`,'Review the supporting measurements and include eligible value in the next certification/IPC.',unbilledWork,'currency',{earned,billed,unbilledWork},95);
    if(pendingVariations>0) add('VARIATION','NOW','Convert pending changes into revenue',`Pending/submitted change orders represent ${r(pendingVariations).toLocaleString()} of potential contract value not yet approved.`,'Complete commercial substantiation, submit the change and track client approval.',pendingVariations,'currency',{pendingVariations,changeOrders:change.filter(x=>['DRAFT','SUBMITTED'].includes(x.status)).map(x=>x.title)},93);
    if(marginLeakage>0) add('MARGIN','NOW','Protect forecast margin',`Forecast margin is ${r(marginLeakage).toLocaleString()} below the baseline margin signal.`,'Review the largest actual/commitment drivers and create quantified containment actions.',marginLeakage,'currency',{baselineMargin,forecastMargin,actualCost,committedCost},92);
    if(overdueReceivables>0) add('CASH','NOW','Recover overdue project receivables',`Customer receivables overdue on this project total ${r(overdueReceivables).toLocaleString()}.`,'Assign collection owners, resolve certification disputes and agree payment dates.',overdueReceivables,'currency',{overdueReceivables,outstanding},91);
    if(materialRisk>0) add('PROCUREMENT','NOW','Prevent material-driven margin loss',`${materialRisk} material requirement(s) are past their required date without full receipt.`,'Escalate supplier delivery, confirm alternatives and quantify schedule/cost exposure.',materialRisk,'items',{materialRisk},88);
    if(lowProductivity>0) add('PRODUCTIVITY','THIS_WEEK','Recover production efficiency',`${lowProductivity} recent productivity records are below 85% of baseline.`,'Identify the affected workfronts and set a measurable crew production target.',lowProductivity,'records',{lowProductivity},82);
    if(overdueRfis>0) add('CONTRACT','THIS_WEEK','Resolve decisions blocking value',`${overdueRfis} RFI(s) are overdue and may delay productive work or certification.`,'Escalate decisions with a deadline and preserve the evidence trail for any entitlement.',overdueRfis,'RFIs',{overdueRfis},85);
    if(highRisks>0) add('RISK','THIS_WEEK','Mitigate high commercial risks',`${highRisks} high-rated project risks remain open.`,'Assign mitigation owners and connect high-impact risks to commercial or recovery actions.',highRisks,'risks',{highRisks},80);
    const status=marginLeakage>0||revenueRecovery>0?'RED':(materialRisk||overdueReceivables>0||lowProductivity?'AMBER':'GREEN');
    return {project:{id:p.id,name:p.name,code:p.code,currency:p.currency||'NGN'},health:{status},contract:{baseContract:r(baseContract),approvedVariations:r(approvedVariations),revisedContract:r(revisedContract)},revenue:{earned:r(earned),billed:r(billed),unbilledWork:r(unbilledWork),pendingVariations:r(pendingVariations),recoveryOpportunity:r(revenueRecovery),outstanding:r(outstanding)},cost:{actual:r(actualCost),committed:r(committedCost),forecast:r(forecastCost),baselineMargin:r(baselineMargin),forecastMargin:r(forecastMargin),marginLeakage:r(marginLeakage),openSupplierExposure:r(openSupplierExposure)},signals:{materialRisk,lowProductivity,overdueRfis,highRisks},recommendations};
  }
  async events({companyId,projectId=null}){let q=this.supabase.from('project_value_protection_events').select('*').eq('company_id',companyId).order('created_at',{ascending:false}).limit(100);if(projectId)q=q.eq('project_id',projectId);const {data,error}=await q;if(error)throw error;return data||[];}
  async recordEvent({companyId,userId,input}){const row={id:randomUUID(),company_id:companyId,project_id:input.projectId,type:input.type,title:input.title,detected_value:n(input.detectedValue),realized_value:input.realizedValue==null?null:n(input.realizedValue),currency:input.currency||'NGN',status:input.status||'DETECTED',source:input.source||'REVENUE_MARGIN_INTELLIGENCE',owner_user_id:input.ownerUserId||userId,notes:input.notes||null,created_by:userId};const {data,error}=await this.supabase.from('project_value_protection_events').insert(row).select().single();if(error)throw error;return data;}
  summary(rows,events){const recs=rows.flatMap(x=>x.recommendations);return {projectsAnalysed:rows.length,redProjects:rows.filter(x=>x.health.status==='RED').length,amberProjects:rows.filter(x=>x.health.status==='AMBER').length,revenueOpportunity:r(rows.reduce((s,x)=>s+x.revenue.recoveryOpportunity,0)),marginLeakage:r(rows.reduce((s,x)=>s+x.cost.marginLeakage,0)),unbilledWork:r(rows.reduce((s,x)=>s+x.revenue.unbilledWork,0)),pendingVariations:r(rows.reduce((s,x)=>s+x.revenue.pendingVariations,0)),now:recs.filter(x=>x.priority==='NOW').length,thisWeek:recs.filter(x=>x.priority==='THIS_WEEK').length,realizedValue:r((events||[]).reduce((s,x)=>s+n(x.realized_value),0))};}
}
