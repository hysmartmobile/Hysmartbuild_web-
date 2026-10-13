import { randomUUID } from 'node:crypto';
const n=v=>Number(v||0); const dateOnly=d=>new Date(d).toISOString().slice(0,10);
const addDays=(d,days)=>{const x=new Date(`${d}T00:00:00Z`);x.setUTCDate(x.getUTCDate()+days);return dateOnly(x);};
const weekStart=d=>{const x=new Date(`${d}T00:00:00Z`);const day=x.getUTCDay();x.setUTCDate(x.getUTCDate()-(day===0?6:day-1));return dateOnly(x);};
const weeksBetween=(a,b)=>Math.max(0,Math.floor((new Date(`${b}T00:00:00Z`)-new Date(`${a}T00:00:00Z`))/604800000));
export class TreasuryService {
  constructor({supabase}){this.supabase=supabase;}
  async assertCompany(companyId){const {data,error}=await this.supabase.from('companies').select('id').eq('id',companyId).maybeSingle();if(error)throw error;if(!data){const e=new Error('Company not found');e.status=404;throw e;}}
  async openingCash(companyId){const [a,t]=await Promise.all([this.supabase.from('bank_accounts').select('opening_balance').eq('company_id',companyId).eq('active',true),this.supabase.from('bank_transactions').select('amount,transaction_type').eq('company_id',companyId)]);if(a.error)throw a.error;if(t.error)throw t.error;return (a.data||[]).reduce((s,x)=>s+n(x.opening_balance),0)+(t.data||[]).reduce((s,x)=>s+(x.transaction_type==='CREDIT'?n(x.amount):-n(x.amount)),0);}
  async invoices(companyId,projectId){let ar=this.supabase.from('accounts_receivable_invoices').select('id,project_id,due_date,total,amount_paid,currency,status').eq('company_id',companyId).in('status',['ISSUED','PARTIALLY_PAID']);let ap=this.supabase.from('supplier_invoices').select('id,total,amount_paid,due_date,currency,status,purchase_orders!supplier_invoices_po_tenant_fk!inner(project_id)').eq('company_id',companyId).in('status',['RECEIVED','APPROVED','PARTIALLY_PAID']);if(projectId){ar=ar.eq('project_id',projectId);ap=ap.eq('purchase_orders.project_id',projectId);}const [r,p]=await Promise.all([ar,ap]);if(r.error)throw r.error;if(p.error)throw p.error;return {ar:r.data||[],ap:p.data||[]};}
  async payroll(companyId,projectId){let q=this.supabase.from('payroll_runs').select('pay_date,net_amount,status').eq('company_id',companyId).in('status',['APPROVED','PAID']).not('pay_date','is',null);const {data,error}=await q;if(error)throw error;return data||[];}
  async committed(companyId,projectId){let q=this.supabase.from('purchase_orders').select('project_id,total,status,expected_date').eq('company_id',companyId).in('status',['APPROVED','PARTIALLY_RECEIVED','RECEIVED']);if(projectId)q=q.eq('project_id',projectId);const {data,error}=await q;if(error)throw error;return data||[];}
  async forecast({companyId,projectId=null,horizonWeeks=13,collectionRate=1,paymentRate=1,contingencyRate=0,userId,persist=true}){
    await this.assertCompany(companyId); horizonWeeks=Number(horizonWeeks); if(![13,26,52].includes(horizonWeeks)) throw Object.assign(new Error('Horizon must be 13, 26 or 52 weeks'),{status:400,code:'INVALID_HORIZON'});
    const [opening,{ar,ap},payroll,pos]=await Promise.all([this.openingCash(companyId),this.invoices(companyId,projectId),this.payroll(companyId,projectId),this.committed(companyId,projectId)]);
    const payrollRows=projectId?[]:payroll;
    const today=dateOnly(new Date()), start=weekStart(today), lines=[]; let cash=opening;
    const bucket=(rows,fn)=>{const out=new Map();for(const x of rows){const d=fn(x);if(!d)continue;const w=weekStart(d);out.set(w,(out.get(w)||0)+n(x.amount ?? x.net_amount ?? (x.total!=null ? Math.max(0,n(x.total)-n(x.amount_paid)) : 0)));}return out;};
    const arB=bucket(ar,x=>x.due_date), apB=bucket(ap,x=>x.due_date), payB=bucket(payrollRows,x=>x.pay_date), poB=bucket(pos,x=>x.expected_date);
    for(const [k,v] of payB.entries()) payB.set(k, n(v));
    for(let i=0;i<horizonWeeks;i++){
      const w=addDays(start,i*7), collections=n(arB.get(w))*Number(collectionRate), supplier=n(apB.get(w))*Number(paymentRate), payrollOut=n(payB.get(w))*Number(paymentRate), committed=n(poB.get(w))*Number(paymentRate), contingency=(supplier+payrollOut+committed)*Number(contingencyRate), movement=collections-supplier-payrollOut-committed-contingency;
      const openingLine=cash; cash+=movement; lines.push({weekStart:w,openingCash:openingLine,expectedCollections:collections,expectedSupplierPayments:supplier,expectedPayroll:payrollOut,committedCashOut:committed,contingencyOut:contingency,netCashMovement:movement,closingCash:cash,fundingGap:Math.max(0,-cash)});
    }
    const minimum=Math.min(opening,...lines.map(x=>x.closingCash)), ending=lines.at(-1)?.closingCash??opening, gap=Math.max(0,-minimum);
    let run=null;
    if(persist){
      const {data,error}=await this.supabase.from('cash_forecast_runs').insert({id:randomUUID(),company_id:companyId,project_id:projectId,horizon_weeks:horizonWeeks,collection_rate:Number(collectionRate),payment_rate:Number(paymentRate),contingency_rate:Number(contingencyRate),opening_cash:opening,minimum_cash:minimum,ending_cash:ending,peak_funding_gap:gap,created_by:userId||null}).select().single();if(error)throw error;run=data;
      const rows=lines.map(x=>({...x,id:randomUUID(),run_id:run.id,company_id:companyId,project_id:projectId}));const {error:le}=await this.supabase.from('cash_forecast_lines').insert(rows);if(le)throw le;
    }
    const alerts=[]; if(gap>0)alerts.push({severity:'CRITICAL',type:'FUNDING_GAP',message:`Forecast cash falls below zero by ${gap.toFixed(2)} during the horizon.`}); if(minimum<opening*0.25&&opening>0)alerts.push({severity:'HIGH',type:'LOW_LIQUIDITY_BUFFER',message:'Forecast minimum cash falls below 25% of current opening cash.'}); const overdueAr=ar.filter(x=>x.due_date&&x.due_date<today); const overdueAp=ap.filter(x=>x.due_date&&x.due_date<today); if(overdueAr.length)alerts.push({severity:'HIGH',type:'OVERDUE_COLLECTIONS',message:`${overdueAr.length} customer invoice(s) are overdue.`}); if(overdueAp.length)alerts.push({severity:'HIGH',type:'OVERDUE_SUPPLIER_PAYABLES',message:`${overdueAp.length} supplier invoice(s) are overdue.`});
    return {run,lines,alerts,drivers:{receivablesOutstanding:ar.reduce((s,x)=>s+Math.max(0,n(x.total)-n(x.amount_paid)),0),payablesOutstanding:ap.reduce((s,x)=>s+Math.max(0,n(x.total)-n(x.amount_paid)),0),committedPurchaseOrders:pos.reduce((s,x)=>s+n(x.total),0),overdueReceivables:overdueAr.reduce((s,x)=>s+Math.max(0,n(x.total)-n(x.amount_paid)),0),overduePayables:overdueAp.reduce((s,x)=>s+Math.max(0,n(x.total)-n(x.amount_paid)),0)},assumptions:{collectionRate:Number(collectionRate),paymentRate:Number(paymentRate),contingencyRate:Number(contingencyRate)},generatedAt:new Date().toISOString()};
  }
  async history({companyId,projectId=null,limit=20}){let q=this.supabase.from('cash_forecast_runs').select('*').eq('company_id',companyId).order('created_at',{ascending:false}).limit(Number(limit));if(projectId)q=q.eq('project_id',projectId);const {data,error}=await q;if(error)throw error;return data||[];}
}
