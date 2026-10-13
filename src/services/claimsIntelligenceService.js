const n=v=>Number(v||0); const dt=v=>v?new Date(v):null;
export class ClaimsIntelligenceService{
 constructor({supabase}){this.supabase=supabase;}
 async analyze({companyId,projectId}){
  const [co,rfis,ins,docs,progress]=await Promise.all([
   this.supabase.from('project_change_orders').select('*').eq('company_id',companyId),
   this.supabase.from('collaboration_rfis').select('id,project_id,subject,status,due_date,created_at').eq('company_id',companyId),
   this.supabase.from('collaboration_site_instructions').select('id,project_id,subject,instruction,status,due_date').eq('company_id',companyId),
   this.supabase.from('documents').select('id,project_id,name,document_type:category,created_at').eq('company_id',companyId),
   this.supabase.from('project_progress_measurements').select('id,project_id,quantity_completed,measured_value,status,measurement_date').eq('company_id',companyId)
  ]); for(const r of [co,rfis,ins,docs,progress])if(r.error)throw r.error;
  const f=x=>!projectId||x.project_id===projectId; const changes=(co.data||[]).filter(f), rf=(rfis.data||[]).filter(f), instructions=(ins.data||[]).filter(f), ds=(docs.data||[]).filter(f), pm=(progress.data||[]).filter(f); const findings=[];
  for(const x of instructions.filter(i=>!['CANCELLED','REJECTED'].includes(i.status))){const linked=changes.some(c=>c.title&&x.subject&&c.title.toLowerCase().includes(x.subject.toLowerCase()));if(!linked)findings.push({type:'POTENTIAL_VARIATION',priority:'HIGH',title:`Review instruction: ${x.subject}`,reason:'A site instruction has no obvious linked change order.',evidence:[x.id],recommendedAction:'Review entitlement, price the change and preserve notice/evidence.'});}
  for(const x of rf.filter(r=>r.status!=='CLOSED'&&r.due_date&&dt(r.due_date)<new Date()))findings.push({type:'EOT_RISK',priority:'HIGH',title:`Overdue RFI: ${x.subject}`,reason:'Unresolved technical information may affect time entitlement.',evidence:[x.id],recommendedAction:'Record impact, issue contractual notice where applicable and link affected activities.'});
  const unapproved=changes.filter(x=>!['APPROVED','REJECTED','CANCELLED'].includes(x.status)); const progressValue=pm.filter(x=>x.status==='APPROVED').reduce((s,x)=>s+n(x.measured_value),0);
  return {generatedAt:new Date().toISOString(),summary:{potentialEntitlements:findings.length,unapprovedChanges:unapproved.length,approvedProgressValue:progressValue,evidenceDocuments:ds.length},findings,changeOrders:changes,rfis:rf,instructions, evidence:{documents:ds.slice(0,100),progress:pm.slice(0,100)}};
 }
}
