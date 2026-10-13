export class AnalyticsService {
  constructor({ supabase }) { this.supabase = supabase; }
  async list(companyId, table, select, { projectId, siteId, fromDate, toDate, page=1, pageSize=100 }={}) {
    const from=(page-1)*pageSize,to=from+pageSize-1;
    let q=this.supabase.from(table).select(select,{count:'exact'}).eq('company_id',companyId);
    if(projectId) q=q.eq('project_id',projectId);
    if(siteId) q=q.eq('site_id',siteId);
    const dateCol=table==='attendance_records'?'attendance_date':table==='daily_site_reports'?'report_date':table==='financial_records'?'record_date':'created_at';
    if(fromDate) q=q.gte(dateCol,fromDate);
    if(toDate) q=q.lte(dateCol,toDate);
    q=q.order(dateCol,{ascending:false}).range(from,to);
    const {data,count,error}=await q;if(error)throw error;
    return {items:data??[],page,pageSize,total:count??0,totalPages:Math.ceil((count??0)/pageSize)};
  }
  async overview({companyId,projectId,fromDate,toDate}) {
    const [projects,workers,attendance,expenses,records,reports]=await Promise.all([
      this.list(companyId,'projects','id,name,status,progress',{page:1,pageSize:1000}),
      this.list(companyId,'workers','id,full_name,status',{page:1,pageSize:1000}),
      this.list(companyId,'attendance_records','id,worker_id,status,attendance_date',{projectId,fromDate,toDate,page:1,pageSize:1000}),
      this.list(companyId,'expenses','id,project_id,status,amount,currency,expense_date',{projectId,fromDate,toDate,page:1,pageSize:1000}),
      this.list(companyId,'financial_records','id,project_id,record_type,amount,currency,record_date',{projectId,fromDate,toDate,page:1,pageSize:1000}),
      this.list(companyId,'daily_site_reports','id,project_id,report_date,overall_progress,workforce_count',{projectId,fromDate,toDate,page:1,pageSize:1000})
    ]);
    const attendanceSummary={total:attendance.items.length,present:0,absent:0,late:0,onLeave:0};
    for(const r of attendance.items){if(r.status==='PRESENT')attendanceSummary.present++;else if(r.status==='ABSENT')attendanceSummary.absent++;else if(r.status==='LATE')attendanceSummary.late++;else if(r.status==='ON_LEAVE')attendanceSummary.onLeave++;}
    const financial={income:0,expense:0,payment:0,refund:0,transfer:0,adjustment:0};
    for(const r of records.items){const k=r.record_type.toLowerCase();if(k in financial)financial[k]+=Number(r.amount);}
    const pendingExpenses=expenses.items.filter(x=>x.status==='PENDING').reduce((s,x)=>s+Number(x.amount),0);
    const approvedExpenses=expenses.items.filter(x=>x.status==='APPROVED').reduce((s,x)=>s+Number(x.amount),0);
    const latestProgress=reports.items[0]?.overall_progress??null;
    return {projects:{total:projects.total,active:projects.items.filter(x=>['ACTIVE','IN_PROGRESS'].includes(x.status)).length},workers:{total:workers.total,active:workers.items.filter(x=>x.status==='ACTIVE').length},attendance:attendanceSummary,finance:{...financial,pendingExpenses,approvedExpenses,netIncome:financial.income-financial.expense-financial.payment+financial.refund},siteProgress:{latest:latestProgress,reports:reports.total}};
  }
  async exportRows({companyId,reportType,projectId,siteId,fromDate,toDate}) {
    if(reportType==='finance') return (await this.list(companyId,'financial_records','record_date,record_type,reference,description,amount,currency,project_id,site_id',{projectId,siteId,fromDate,toDate,page:1,pageSize:10000})).items;
    if(reportType==='workforce') return (await this.list(companyId,'attendance_records','attendance_date,worker_id,status,check_in_at,check_out_at,project_id,site_id,notes',{projectId,siteId,fromDate,toDate,page:1,pageSize:10000})).items;
    if(reportType==='progress') return (await this.list(companyId,'daily_site_reports','report_date,project_id,site_id,overall_progress,workforce_count,work_completed,issues,delays',{projectId,siteId,fromDate,toDate,page:1,pageSize:10000})).items;
    if(reportType==='expenses') return (await this.list(companyId,'expenses','expense_date,project_id,site_id,category,description,vendor_name,amount,currency,status',{projectId,siteId,fromDate,toDate,page:1,pageSize:10000})).items;
    const e=new Error('Unsupported report type');e.code='REPORT_TYPE_NOT_SUPPORTED';e.status=400;throw e;
  }
}
