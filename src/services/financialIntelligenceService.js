import { randomUUID } from 'node:crypto';

const n = v => Number(v || 0);
const sum = (rows, fn) => (rows || []).reduce((a, r) => a + n(fn(r)), 0);
const iso = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);
const byCurrency = (rows, amountFn, currencyFn) => rows.reduce((m,r)=>{const c=String(currencyFn(r)||'NGN').toUpperCase();m[c]=(m[c]||0)+n(amountFn(r));return m;},{});
const median = values => { const a = values.filter(Number.isFinite).sort((x,y)=>x-y); if (!a.length) return 0; const m=Math.floor(a.length/2); return a.length%2?a[m]:(a[m-1]+a[m])/2; };

export class FinancialIntelligenceService {
  constructor({ supabase }) { this.supabase = supabase; }

  async assertCompany({ companyId }) {
    const { data, error } = await this.supabase.from('companies').select('id,name,currency_code').eq('id', companyId).maybeSingle();
    if (error) throw error;
    if (!data) { const e = new Error('Company not found'); e.code='COMPANY_NOT_FOUND'; e.status=404; throw e; }
    return data;
  }

  async dashboard({ companyId, projectId=null, persist=false, userId=null }) {
    const company = await this.assertCompany({ companyId });
    const [banks, bankTx, ar, ap, payroll, equipment, allocations, equipmentLogs, maintenance, ledger, expenses, projects] = await Promise.all([
      this.supabase.from('bank_accounts').select('id,name,bank_name,currency,opening_balance,active').eq('company_id',companyId).eq('active',true),
      this.supabase.from('bank_transactions').select('id,bank_account_id,transaction_date,reference,description,amount,transaction_type,reconciled').eq('company_id',companyId).order('transaction_date',{ascending:false}).limit(5000),
      this.supabase.from('accounts_receivable_invoices').select('id,project_id,customer_name,invoice_no,invoice_date,due_date,currency,status,total,amount_paid').eq('company_id',companyId).not('status','eq','VOID'),
      this.supabase.from('supplier_invoices').select('id,purchase_order_id,invoice_no,invoice_date,due_date,currency,status,total,amount_paid').eq('company_id',companyId).not('status','eq','VOID'),
      this.supabase.from('payroll_runs').select('id,run_no,period_start,period_end,pay_date,status,gross_amount,net_amount,currency').eq('company_id',companyId).not('status','eq','VOID').order('period_end',{ascending:false}).limit(100),
      this.supabase.from('project_equipment').select('id,asset_no,name,category,ownership,status,hourly_rate,daily_rate,currency').eq('company_id',companyId).not('status','eq','RETIRED'),
      this.supabase.from('project_equipment_allocations').select('id,equipment_id,project_id,start_date,end_date,status').eq('company_id',companyId),
      this.supabase.from('project_equipment_logs').select('id,equipment_id,project_id,log_date,hours_used,fuel_quantity,fuel_cost').eq('company_id',companyId).order('log_date',{ascending:false}).limit(10000),
      this.supabase.from('project_equipment_maintenance').select('id,equipment_id,maintenance_date,maintenance_type,cost,status,next_due_date').eq('company_id',companyId).order('maintenance_date',{ascending:false}).limit(2000),
      this.supabase.from('project_cost_ledger_v').select('project_id,entry_type,amount,currency,entry_date').eq('company_id',companyId).limit(10000),
      this.supabase.from('expenses').select('id,project_id,amount,currency,expense_date,status,category').eq('company_id',companyId).in('status',['APPROVED','PAID']).order('expense_date',{ascending:false}).limit(5000),
      this.supabase.from('projects').select('id,name,currency_code,status').eq('company_id',companyId)
    ]);
    for (const r of [banks,bankTx,ar,ap,payroll,equipment,allocations,equipmentLogs,maintenance,ledger,expenses,projects]) if (r.error) throw r.error;

    const bankRows=banks.data||[], tx=bankTx.data||[], arRows=ar.data||[], apRows=ap.data||[], payrollRows=payroll.data||[], equipmentRows=equipment.data||[], allocationRows=allocations.data||[], logRows=equipmentLogs.data||[], maintenanceRows=maintenance.data||[], ledgerRows=ledger.data||[], expenseRows=expenses.data||[], projectRows=projects.data||[];
    const selectedProject = projectId ? projectRows.find(p=>p.id===projectId) : null;
    if (projectId && !selectedProject) { const e=new Error('Project not found'); e.code='PROJECT_NOT_FOUND'; e.status=404; throw e; }
    const inProject = row => !projectId || row.project_id===projectId;

    const cashByAccount = bankRows.map(b => { const rows=tx.filter(t=>t.bank_account_id===b.id); const credits=sum(rows,r=>r.transaction_type==='CREDIT'?Math.abs(r.amount):0); const debits=sum(rows,r=>r.transaction_type==='DEBIT'?Math.abs(r.amount):0); return {...b,credits,debits,closingBalance:n(b.opening_balance)+credits-debits}; });
    const cashByCurrency=byCurrency(cashByAccount,r=>r.closingBalance,r=>r.currency);
    const baseCurrency=String(company.currency_code||'NGN').toUpperCase();
    const cashPosition=n(cashByCurrency[baseCurrency]);
    const unreconciled=tx.filter(t=>!t.reconciled);
    const unreconciledValue=sum(unreconciled,r=>Math.abs(r.amount));

    const arOpen=arRows.filter(r=>n(r.total)-n(r.amount_paid)>0);
    const overdueAR=arOpen.filter(r=>r.due_date && r.due_date<today());
    const arOutstandingByCurrency=byCurrency(arOpen,r=>n(r.total)-n(r.amount_paid),r=>r.currency);
    const overdueARByCurrency=byCurrency(overdueAR,r=>n(r.total)-n(r.amount_paid),r=>r.currency);
    const arOutstanding=n(arOutstandingByCurrency[baseCurrency]);
    const overdueARValue=n(overdueARByCurrency[baseCurrency]);
    const apOpen=apRows.filter(r=>n(r.total)-n(r.amount_paid)>0);
    const overdueAP=apOpen.filter(r=>r.due_date && r.due_date<today());
    const apOutstandingByCurrency=byCurrency(apOpen,r=>n(r.total)-n(r.amount_paid),r=>r.currency);
    const overdueAPByCurrency=byCurrency(overdueAP,r=>n(r.total)-n(r.amount_paid),r=>r.currency);
    const apOutstanding=n(apOutstandingByCurrency[baseCurrency]);
    const overdueAPValue=n(overdueAPByCurrency[baseCurrency]);
    const payrollDue=payrollRows.filter(r=>['APPROVED'].includes(r.status)).reduce((a,r)=>a+n(r.net_amount),0);
    const payrollPaid=payrollRows.filter(r=>r.status==='PAID').reduce((a,r)=>a+n(r.net_amount),0);

    const filteredLedger=ledgerRows.filter(inProject);
    const actualCost=sum(filteredLedger,r=>r.entry_type==='ACTUAL'?r.amount:0);
    const committedCost=sum(filteredLedger,r=>r.entry_type==='COMMITMENT'?r.amount:0);
    const filteredExpenses=expenseRows.filter(inProject);
    const recordedExpenses=sum(filteredExpenses,r=>r.amount);

    const fuelRows=logRows.filter(inProject);
    const fuelQty=sum(fuelRows,r=>r.fuel_quantity), fuelCost=sum(fuelRows,r=>r.fuel_cost), machineHours=sum(fuelRows,r=>r.hours_used);
    const fuelIntensity=fuelQty/(machineHours||1);
    const projectEquipmentIds=new Set(allocationRows.filter(a=>inProject(a)).map(a=>a.equipment_id));
    const equipmentUsage=equipmentRows.map(e=>{ const logs=fuelRows.filter(l=>l.equipment_id===e.id); const hours=sum(logs,r=>r.hours_used); const fuel=sum(logs,r=>r.fuel_quantity); const alloc=allocationRows.filter(a=>a.equipment_id===e.id && inProject(a)); return {...e,hoursUsed:hours,fuelQuantity:fuel,allocationCount:alloc.length}; }).filter(e=>!projectId||projectEquipmentIds.has(e.id));
    const intensities=equipmentUsage.map(e=>e.fuelQuantity/(e.hoursUsed||1)).filter(v=>v>0); const medianFuel=median(intensities);
    const fuelOutliers=equipmentUsage.filter(e=>{const intensity=e.fuelQuantity/(e.hoursUsed||1);return medianFuel>0&&e.hoursUsed>0&&intensity>medianFuel*1.5;}).map(e=>({...e,fuelPerHour:e.fuelQuantity/(e.hoursUsed||1)}));
    const maintenanceDue=maintenanceRows.filter(m=>m.next_due_date&&m.next_due_date<=today()&&m.status!=='COMPLETED');

    const projectCost = projectRows.filter(p=>!projectId||p.id===projectId).map(p=>{const rows=ledgerRows.filter(r=>r.project_id===p.id);return {project:p,actualCost:sum(rows,r=>r.entry_type==='ACTUAL'?r.amount:0),committedCost:sum(rows,r=>r.entry_type==='COMMITMENT'?r.amount:0),expenseCost:sum(expenseRows.filter(e=>e.project_id===p.id),r=>r.amount)};});

    const alerts=[];
    if (cashPosition<0) alerts.push({severity:'CRITICAL',type:'CASH',title:'Cash position is negative',value:cashPosition,action:'Review funding and collections before committing further cash.'});
    if (overdueARValue>0) alerts.push({severity:overdueARValue>cashPosition?'CRITICAL':'HIGH',type:'AR',title:'Overdue client receivables require collection action',value:overdueARValue,action:'Assign collection owners and link overdue invoices to client follow-up.'});
    if (overdueAPValue>0) alerts.push({severity:'HIGH',type:'AP',title:'Supplier liabilities are overdue',value:overdueAPValue,action:'Sequence payments against cash forecast and supplier criticality.'});
    if (unreconciledValue>0) alerts.push({severity:'MEDIUM',type:'BANK',title:'Bank transactions remain unreconciled',value:unreconciledValue,action:'Reconcile bank activity so cash truth and accounting truth agree.'});
    if (payrollDue>0) alerts.push({severity:'HIGH',type:'PAYROLL',title:'Approved payroll remains unpaid',value:payrollDue,action:'Protect payroll funding and confirm the next payment date.'});
    if (fuelOutliers.length) alerts.push({severity:'MEDIUM',type:'FUEL',title:`${fuelOutliers.length} equipment fuel outlier(s) detected`,value:fuelOutliers.length,action:'Check fuel issue records, idle time, equipment condition and operator logs.'});
    if (maintenanceDue.length) alerts.push({severity:'MEDIUM',type:'EQUIPMENT',title:`${maintenanceDue.length} equipment maintenance item(s) are due`,value:maintenanceDue.length,action:'Schedule maintenance before reliability becomes production downtime.'});

    const data={asOf:iso(),company,scope:{projectId:projectId||null,projectName:selectedProject?.name||null},summary:{cashPosition,arOutstanding,overdueARValue,apOutstanding,overdueAPValue,payrollDue,payrollPaid,actualCost,committedCost,recordedExpenses,unreconciledBankValue:unreconciledValue,fuelCost,fuelQuantity,machineHours,fuelIntensity,equipmentCount:equipmentUsage.length,maintenanceDue:maintenanceDue.length},baseCurrency,cashByCurrency,cashByAccount,receivables:{open:arOpen,overdue:overdueAR,outstandingByCurrency:arOutstandingByCurrency,overdueByCurrency:overdueARByCurrency},payables:{open:apOpen,overdue:overdueAP,outstandingByCurrency:apOutstandingByCurrency,overdueByCurrency:overdueAPByCurrency},payroll:{runs:payrollRows.slice(0,20)},equipment:{assets:equipmentUsage,maintenanceDue,fuelOutliers,medianFuelPerHour:medianFuel},projectCost,alerts,principles:['Accounting remains the ledger source. HySmart explains construction consequences behind the ledger.','No autonomous payment, payroll, bank or accounting approval is performed by this intelligence layer.','All anomalies are evidence-backed signals for human review.']};
    if(persist){const {data:row,error}=await this.supabase.from('financial_intelligence_snapshots').insert({id:randomUUID(),company_id:companyId,project_id:projectId||null,created_by:userId,data,created_at:iso()}).select('id,company_id,project_id,created_at').single();if(error)throw error;data.snapshot=row;}
    return data;
  }

  async history({companyId,projectId=null,limit=20}) { let q=this.supabase.from('financial_intelligence_snapshots').select('id,company_id,project_id,created_by,created_at,data').eq('company_id',companyId).order('created_at',{ascending:false}).limit(Math.min(Number(limit)||20,100)); if(projectId)q=q.eq('project_id',projectId); const {data,error}=await q;if(error)throw error;return data||[]; }
}
