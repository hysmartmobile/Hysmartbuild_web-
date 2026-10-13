const ELEVATED_COMPANY_ROLES = new Set(['SUPER_ADMIN','COMPANY_OWNER','COMPANY_ADMIN','CEO','DIRECTOR','MANAGEMENT']);
const nowIso = () => new Date().toISOString();

function item({ id, entityType, title, description, status, projectId=null, createdAt=null, dueAt=null, href, section, action=null, canAct=false, reasonRequired=false, metadata={} }) {
  return { id: `${entityType}:${id}`, sourceId:id, entityType, title:title||'Untitled item', description:description||'', status:status||'OPEN', projectId, createdAt, dueAt, href:href||'/dashboard', section, action:canAct?action:null, canAct:Boolean(canAct&&action), reasonRequired, metadata };
}

export class MyWorkService {
  constructor({ supabase }) { this.supabase=supabase; }
  async _rows(table, select, companyId, configure) {
    let q=this.supabase.from(table).select(select).eq('company_id',companyId);
    if(configure) q=configure(q);
    const {data,error}=await q;
    if(error) throw error;
    return data||[];
  }
  async get({companyId,userId,role,permissions=[]}) {
    const elevated=ELEVATED_COMPANY_ROLES.has(role);
    const projectRows=await this._rows('project_members','project_id,status',companyId,q=>q.eq('user_id',userId).eq('status','ACTIVE'));
    const projectIds=new Set(projectRows.map(x=>x.project_id));
    const allowedProject=id=>!id||elevated||projectIds.has(id);
    let projectRowsForNames=[];
    if(elevated){projectRowsForNames=await this._rows('projects','id,name',companyId,q=>q.order('name',{ascending:true}).limit(300));}
    else if(projectIds.size){projectRowsForNames=await this._rows('projects','id,name',companyId,q=>q.in('id',[...projectIds]).order('name',{ascending:true}).limit(300));}
    const projectNames=new Map(projectRowsForNames.map(x=>[x.id,x.name]));
    const can=p=>permissions.includes(p);
    const [tasks,issues,reports,expenses,submittals,rfis,instructions,transmittals,actions,notifications,activity,events,materialRequests,requisitions,purchaseOrders,supplierInvoices,quotations,payrollRuns]=await Promise.all([
      this._rows('tasks','id,project_id,title,description,status,priority,assigned_to,created_by,due_date,created_at',companyId,q=>q.or(`assigned_to.eq.${userId},created_by.eq.${userId}`).order('created_at',{ascending:false}).limit(100)),
      this._rows('issues','id,project_id,title,description,status,severity,assigned_to,created_by,due_date,created_at',companyId,q=>q.or(`assigned_to.eq.${userId},created_by.eq.${userId}`).order('created_at',{ascending:false}).limit(100)),
      this._rows('daily_site_reports','id,project_id,report_date,overall_progress,approval_status,created_by,created_at,rejection_reason',companyId,q=>q.or(`created_by.eq.${userId},approval_status.eq.PENDING`).order('created_at',{ascending:false}).limit(150)),
      this._rows('expenses','id,project_id,description,category,amount,currency,status,submitted_by,created_at,rejection_reason',companyId,q=>q.or(`submitted_by.eq.${userId},status.eq.PENDING`).order('created_at',{ascending:false}).limit(150)),
      this._rows('collaboration_submittals','id,project_id,submittal_no,title,status,submitted_by,reviewer_user_id,due_date,review_comments,created_at,reviewed_at',companyId,q=>q.or(`submitted_by.eq.${userId},reviewer_user_id.eq.${userId},status.eq.SUBMITTED,status.eq.UNDER_REVIEW`).order('created_at',{ascending:false}).limit(100)),
      this._rows('collaboration_rfis','id,project_id,rfi_no,subject,question,status,raised_by,assigned_to,due_date,created_at',companyId,q=>q.or(`raised_by.eq.${userId},assigned_to.eq.${userId}`).order('created_at',{ascending:false}).limit(100)),
      this._rows('collaboration_site_instructions','id,project_id,instruction_no,subject,instruction,status,issued_by,assigned_to,due_date,created_at',companyId,q=>q.or(`issued_by.eq.${userId},assigned_to.eq.${userId}`).order('created_at',{ascending:false}).limit(100)),
      this._rows('collaboration_transmittals','id,project_id,transmittal_no,subject,status,sent_by,recipient_user_id,created_at',companyId,q=>q.or(`sent_by.eq.${userId},recipient_user_id.eq.${userId}`).order('created_at',{ascending:false}).limit(100)),
      this._rows('workflow_action_items','id,project_id,title,body,status,severity,assigned_to,due_at,created_at,metadata',companyId,q=>q.eq('assigned_to',userId).order('created_at',{ascending:false}).limit(100)),
      this._rows('notifications','id,project_id,type,title,body,read_at,created_at,actor_user_id',companyId,q=>q.eq('recipient_user_id',userId).order('created_at',{ascending:false}).limit(100)),
      this._rows('project_activity','id,project_id,entity_type,entity_id,action,summary,metadata,created_at',companyId,q=>q.eq('actor_user_id',userId).order('created_at',{ascending:false}).limit(50)),
      this._rows('my_work_events','id,project_id,entity_type,entity_id,action,reason,metadata,created_at',companyId,q=>q.eq('actor_user_id',userId).order('created_at',{ascending:false}).limit(50)),
      this._rows('material_requests','id,project_id,notes,status,requested_by,created_at,rejection_reason',companyId,q=>q.or(`requested_by.eq.${userId},status.eq.PENDING`).order('created_at',{ascending:false}).limit(100)),
      this._rows('purchase_requisitions','id,project_id,requisition_no,justification,status,requested_by,estimated_total,currency,rejection_reason,created_at',companyId,q=>q.or(`requested_by.eq.${userId},status.eq.SUBMITTED`).order('created_at',{ascending:false}).limit(100)),
      this._rows('purchase_orders','id,project_id,po_no,notes,status,created_by,total,currency,created_at',companyId,q=>q.or(`created_by.eq.${userId},status.eq.SUBMITTED`).order('created_at',{ascending:false}).limit(100)),
      this._rows('supplier_invoices','id,invoice_no,status,created_by,total,currency,created_at,purchase_order:purchase_orders!supplier_invoices_purchase_order_id_fkey(project_id)',companyId,q=>q.or(`created_by.eq.${userId},status.eq.RECEIVED`).order('created_at',{ascending:false}).limit(100)),
      this._rows('purchase_quotations','id,quotation_no,status,created_by,total,currency,notes,decision_reason,created_at,requisition:purchase_requisitions!purchase_quotations_requisition_id_fkey(project_id)',companyId,q=>q.or(`created_by.eq.${userId},status.eq.SUBMITTED`).order('created_at',{ascending:false}).limit(100)),
      this._rows('payroll_runs','id,run_no,period_start,period_end,status,gross_amount,net_amount,created_by,created_at',companyId,q=>q.or(`created_by.eq.${userId},status.eq.DRAFT`).order('created_at',{ascending:false}).limit(100))
    ]);
    const personal=[]; const received=[]; const sent=[]; const review=[]; const decisions=[]; const history=[];
    for(const t of tasks.filter(x=>allowedProject(x.project_id))){
      const isAssigned=t.assigned_to===userId;
      const it=item({id:t.id,entityType:'TASK',title:t.title,description:t.description,status:t.status,projectId:t.project_id,createdAt:t.created_at,dueAt:t.due_date,href:'/tasks',section:isAssigned?'personal':'sent',action:'TASK_STATUS',canAct:can('task:update')&&(isAssigned||t.created_by===userId),metadata:{priority:t.priority,assignedTo:t.assigned_to}});
      personal.push(it); if(isAssigned) received.push(it); if(t.created_by===userId) sent.push(it);
    }
    for(const x of issues.filter(x=>allowedProject(x.project_id))){const assigned=x.assigned_to===userId;const it=item({id:x.id,entityType:'ISSUE',title:x.title,description:x.description,status:x.status,projectId:x.project_id,createdAt:x.created_at,dueAt:x.due_date,href:'/issues',section:assigned?'personal':'sent',action:'ISSUE_STATUS',canAct:can('issue:update')&&(assigned||x.created_by===userId),metadata:{severity:x.severity}});if(assigned){personal.push(it);received.push({...it,section:'received'});}if(x.created_by===userId)sent.push(it);}
    for(const r of reports.filter(x=>allowedProject(x.project_id))){
      if(r.created_by===userId) sent.push(item({id:r.id,entityType:'REPORT',title:`Daily report · ${r.report_date}`,description:`Progress reported: ${r.overall_progress??0}%`,status:r.approval_status||'PENDING',projectId:r.project_id,createdAt:r.created_at,href:'/reports',section:'sent',metadata:{rejectionReason:r.rejection_reason}}));
      if((r.approval_status||'PENDING')==='PENDING'&&can('report:approve')&&r.created_by!==userId) review.push(item({id:r.id,entityType:'REPORT',title:`Review daily report · ${r.report_date}`,description:`Progress reported: ${r.overall_progress??0}%`,status:'PENDING',projectId:r.project_id,createdAt:r.created_at,href:'/reports',section:'review',action:'DECIDE',canAct:true,reasonRequired:true}));
      if(r.created_by===userId&&['APPROVED','REJECTED','RETURNED'].includes(r.approval_status)) decisions.push(item({id:r.id,entityType:'REPORT',title:`Daily report · ${r.report_date}`,description:r.rejection_reason||`Report ${String(r.approval_status).toLowerCase()}.`,status:r.approval_status,projectId:r.project_id,createdAt:r.created_at,href:'/reports',section:'decisions'}));
    }
    for(const e of expenses.filter(x=>allowedProject(x.project_id))){
      if(e.submitted_by===userId) sent.push(item({id:e.id,entityType:'EXPENSE',title:e.description,description:`${e.currency} ${Number(e.amount||0).toLocaleString()} · ${e.category}`,status:e.status,projectId:e.project_id,createdAt:e.created_at,href:'/expenses',section:'sent',metadata:{rejectionReason:e.rejection_reason}}));
      if(e.status==='PENDING'&&can('expense:approve')&&e.submitted_by!==userId) review.push(item({id:e.id,entityType:'EXPENSE',title:`Expense approval · ${e.description}`,description:`${e.currency} ${Number(e.amount||0).toLocaleString()} · ${e.category}`,status:e.status,projectId:e.project_id,createdAt:e.created_at,href:'/expenses',section:'review',action:'DECIDE',canAct:true,reasonRequired:true}));
      if(e.submitted_by===userId&&['APPROVED','REJECTED','PAID'].includes(e.status)) decisions.push(item({id:e.id,entityType:'EXPENSE',title:e.description,description:e.rejection_reason||`Expense ${String(e.status).toLowerCase()}.`,status:e.status,projectId:e.project_id,createdAt:e.created_at,href:'/expenses',section:'decisions'}));
    }
    for(const s of submittals.filter(x=>allowedProject(x.project_id))){
      if(s.submitted_by===userId) sent.push(item({id:s.id,entityType:'SUBMITTAL',title:`${s.submittal_no} · ${s.title}`,description:s.review_comments||'Submitted for technical review.',status:s.status,projectId:s.project_id,createdAt:s.created_at,href:'/collaboration',section:'sent'}));
      if(['SUBMITTED','UNDER_REVIEW'].includes(s.status)&&(s.reviewer_user_id===userId||(s.reviewer_user_id==null&&can('collaboration:approve')&&allowedProject(s.project_id)))&&s.submitted_by!==userId&&can('collaboration:approve')) review.push(item({id:s.id,entityType:'SUBMITTAL',title:`Review submittal · ${s.submittal_no}`,description:s.title,status:s.status,projectId:s.project_id,createdAt:s.created_at,dueAt:s.due_date,href:'/collaboration',section:'review',action:'DECIDE',canAct:true,reasonRequired:true}));
      if(s.submitted_by===userId&&['APPROVED','APPROVED_WITH_COMMENTS','REJECTED','RESUBMIT'].includes(s.status)) decisions.push(item({id:s.id,entityType:'SUBMITTAL',title:`${s.submittal_no} · ${s.title}`,description:s.review_comments||`Submittal ${String(s.status).toLowerCase().replaceAll('_',' ')}.`,status:s.status,projectId:s.project_id,createdAt:s.reviewed_at||s.created_at,href:'/collaboration',section:'decisions'}));
    }
    for(const r of rfis.filter(x=>allowedProject(x.project_id))){const assigned=r.assigned_to===userId;const it=item({id:r.id,entityType:'RFI',title:`RFI ${r.rfi_no} · ${r.subject}`,description:r.question,status:r.status,projectId:r.project_id,createdAt:r.created_at,dueAt:r.due_date,href:'/collaboration',section:assigned?'received':'sent',action:'RESPOND',canAct:assigned&&can('collaboration:respond')&&['SUBMITTED','UNDER_REVIEW'].includes(r.status)});if(assigned)received.push(it);if(r.raised_by===userId)sent.push(it);}
    for(const x of instructions.filter(x=>allowedProject(x.project_id))){const assigned=x.assigned_to===userId;const it=item({id:x.id,entityType:'SITE_INSTRUCTION',title:`Instruction ${x.instruction_no} · ${x.subject}`,description:x.instruction,status:x.status,projectId:x.project_id,createdAt:x.created_at,dueAt:x.due_date,href:'/collaboration',section:assigned?'received':'sent',action:'ACKNOWLEDGE',canAct:assigned&&can('collaboration:respond')&&x.status==='ISSUED'});if(assigned)received.push(it);if(x.issued_by===userId)sent.push(it);}
    for(const x of transmittals.filter(x=>allowedProject(x.project_id))){const isRecipient=x.recipient_user_id===userId;const it=item({id:x.id,entityType:'TRANSMITTAL',title:`Transmittal ${x.transmittal_no} · ${x.subject}`,description:'Document transmittal',status:x.status,projectId:x.project_id,createdAt:x.created_at,href:'/collaboration',section:isRecipient?'received':'sent'});if(isRecipient)received.push(it);if(x.sent_by===userId)sent.push(it);}
    for(const r of materialRequests.filter(x=>allowedProject(x.project_id))){
      if(r.requested_by===userId)sent.push(item({id:r.id,entityType:'MATERIAL_REQUEST',title:'Material request',description:r.notes||'Material request submitted.',status:r.status,projectId:r.project_id,createdAt:r.created_at,href:'/materials',section:'sent',metadata:{rejectionReason:r.rejection_reason}}));
      if(r.status==='PENDING'&&can('material:approve')&&r.requested_by!==userId)review.push(item({id:r.id,entityType:'MATERIAL_REQUEST',title:'Review material request',description:r.notes||'Material request awaiting a decision.',status:r.status,projectId:r.project_id,createdAt:r.created_at,href:'/materials',section:'review',action:'DECIDE',canAct:true,reasonRequired:true}));
      if(r.requested_by===userId&&['APPROVED','REJECTED','PARTIALLY_ISSUED','ISSUED'].includes(r.status))decisions.push(item({id:r.id,entityType:'MATERIAL_REQUEST',title:'Material request',description:r.rejection_reason||`Material request ${String(r.status).toLowerCase().replaceAll('_',' ')}.`,status:r.status,projectId:r.project_id,createdAt:r.created_at,href:'/materials',section:'decisions'}));
    }
    for(const r of requisitions.filter(x=>allowedProject(x.project_id))){
      if(r.requested_by===userId)sent.push(item({id:r.id,entityType:'PROCUREMENT_REQUISITION',title:`Requisition ${r.requisition_no}`,description:r.justification||`${r.currency} ${Number(r.estimated_total||0).toLocaleString()}`,status:r.status,projectId:r.project_id,createdAt:r.created_at,href:'/procurement',section:'sent',metadata:{rejectionReason:r.rejection_reason}}));
      if(r.status==='SUBMITTED'&&can('procurement:approve')&&r.requested_by!==userId)review.push(item({id:r.id,entityType:'PROCUREMENT_REQUISITION',title:`Approve requisition ${r.requisition_no}`,description:r.justification||`${r.currency} ${Number(r.estimated_total||0).toLocaleString()}`,status:r.status,projectId:r.project_id,createdAt:r.created_at,href:'/procurement',section:'review',action:'DECIDE',canAct:true,reasonRequired:true}));
      if(r.requested_by===userId&&['APPROVED','REJECTED'].includes(r.status))decisions.push(item({id:r.id,entityType:'PROCUREMENT_REQUISITION',title:`Requisition ${r.requisition_no}`,description:r.rejection_reason||`Requisition ${String(r.status).toLowerCase()}.`,status:r.status,projectId:r.project_id,createdAt:r.created_at,href:'/procurement',section:'decisions'}));
    }
    for(const p of purchaseOrders.filter(x=>allowedProject(x.project_id))){
      if(p.created_by===userId)sent.push(item({id:p.id,entityType:'PURCHASE_ORDER',title:`Purchase order ${p.po_no}`,description:p.notes||`${p.currency} ${Number(p.total||0).toLocaleString()}`,status:p.status,projectId:p.project_id,createdAt:p.created_at,href:'/procurement',section:'sent'}));
      if(p.status==='SUBMITTED'&&can('procurement:approve')&&p.created_by!==userId)review.push(item({id:p.id,entityType:'PURCHASE_ORDER',title:`Approve purchase order ${p.po_no}`,description:p.notes||`${p.currency} ${Number(p.total||0).toLocaleString()}`,status:p.status,projectId:p.project_id,createdAt:p.created_at,href:'/procurement',section:'review',action:'APPROVE_ONLY',canAct:true}));
      if(p.created_by===userId&&['APPROVED','SENT','PARTIALLY_RECEIVED','RECEIVED','CANCELLED'].includes(p.status))decisions.push(item({id:p.id,entityType:'PURCHASE_ORDER',title:`Purchase order ${p.po_no}`,description:`Purchase order ${String(p.status).toLowerCase().replaceAll('_',' ')}.`,status:p.status,projectId:p.project_id,createdAt:p.created_at,href:'/procurement',section:'decisions'}));
    }
    for(const quote of quotations){const projectId=quote.requisition?.project_id||null;if(!allowedProject(projectId))continue;
      if(quote.created_by===userId)sent.push(item({id:quote.id,entityType:'PURCHASE_QUOTATION',title:`Quotation ${quote.quotation_no}`,description:quote.notes||`${quote.currency} ${Number(quote.total||0).toLocaleString()}`,status:quote.status,projectId,createdAt:quote.created_at,href:'/procurement',section:'sent'}));
      if(quote.status==='SUBMITTED'&&can('procurement:approve')&&quote.created_by!==userId)review.push(item({id:quote.id,entityType:'PURCHASE_QUOTATION',title:`Review quotation ${quote.quotation_no}`,description:quote.notes||`${quote.currency} ${Number(quote.total||0).toLocaleString()}`,status:quote.status,projectId,createdAt:quote.created_at,href:'/procurement',section:'review',action:'DECIDE',canAct:true,reasonRequired:true,metadata:{decisionAction:'ACCEPT'}}));
      if(quote.created_by===userId&&['ACCEPTED','REJECTED','CANCELLED'].includes(quote.status))decisions.push(item({id:quote.id,entityType:'PURCHASE_QUOTATION',title:`Quotation ${quote.quotation_no}`,description:quote.decision_reason||quote.notes||`Quotation ${String(quote.status).toLowerCase()}.`,status:quote.status,projectId,createdAt:quote.created_at,href:'/procurement',section:'decisions'}));
    }
    for(const inv of supplierInvoices){const projectId=inv.purchase_order?.project_id||null;if(!allowedProject(projectId))continue;
      if(inv.created_by===userId)sent.push(item({id:inv.id,entityType:'SUPPLIER_INVOICE',title:`Supplier invoice ${inv.invoice_no}`,description:`${inv.currency} ${Number(inv.total||0).toLocaleString()}`,status:inv.status,projectId,createdAt:inv.created_at,href:'/procurement',section:'sent'}));
      if(inv.status==='RECEIVED'&&can('procurement:approve')&&inv.created_by!==userId)review.push(item({id:inv.id,entityType:'SUPPLIER_INVOICE',title:`Approve & post invoice ${inv.invoice_no}`,description:`${inv.currency} ${Number(inv.total||0).toLocaleString()}`,status:inv.status,projectId,createdAt:inv.created_at,href:'/procurement',section:'review',action:'APPROVE_ONLY',canAct:true,metadata:{approveLabel:'Approve & post'}}));
      if(inv.created_by===userId&&['APPROVED','PARTIALLY_PAID','PAID'].includes(inv.status))decisions.push(item({id:inv.id,entityType:'SUPPLIER_INVOICE',title:`Supplier invoice ${inv.invoice_no}`,description:`Invoice ${String(inv.status).toLowerCase().replaceAll('_',' ')}.`,status:inv.status,projectId,createdAt:inv.created_at,href:'/procurement',section:'decisions'}));
    }
    for(const run of payrollRuns){
      if(run.created_by===userId)sent.push(item({id:run.id,entityType:'PAYROLL_RUN',title:`Payroll ${run.run_no}`,description:`${run.period_start} – ${run.period_end} · Gross ${Number(run.gross_amount||0).toLocaleString()} · Net ${Number(run.net_amount||0).toLocaleString()}`,status:run.status,createdAt:run.created_at,href:'/accounting',section:'sent'}));
      if(run.status==='DRAFT'&&can('payroll:approve')&&run.created_by!==userId)review.push(item({id:run.id,entityType:'PAYROLL_RUN',title:`Review payroll ${run.run_no}`,description:`${run.period_start} – ${run.period_end} · Gross ${Number(run.gross_amount||0).toLocaleString()} · Net ${Number(run.net_amount||0).toLocaleString()}`,status:run.status,createdAt:run.created_at,href:'/accounting',section:'review',action:'APPROVE_ONLY',canAct:true,metadata:{approveLabel:'Approve payroll'}}));
      if(run.created_by===userId&&['APPROVED','PAID','VOID'].includes(run.status))decisions.push(item({id:run.id,entityType:'PAYROLL_RUN',title:`Payroll ${run.run_no}`,description:`Payroll ${String(run.status).toLowerCase()}.`,status:run.status,createdAt:run.created_at,href:'/accounting',section:'decisions'}));
    }
    for(const a of actions.filter(x=>allowedProject(x.project_id))){personal.push(item({id:a.id,entityType:'WORKFLOW_ACTION',title:a.title,description:a.body,status:a.status,projectId:a.project_id,createdAt:a.created_at,dueAt:a.due_at,href:'/command-centre',section:'personal',action:'WORKFLOW_STATUS',canAct:can('workflow:update')&&['OPEN','ACKNOWLEDGED'].includes(a.status),metadata:{severity:a.severity,...(a.metadata||{})}}));}
    for(const n of notifications.filter(x=>allowedProject(x.project_id))){const it=item({id:n.id,entityType:'NOTIFICATION',title:n.title,description:n.body,status:n.read_at?'READ':'UNREAD',projectId:n.project_id,createdAt:n.created_at,href:n.project_id?'/projects':'/notifications',section:'received',action:'MARK_READ',canAct:can('notification:update')&&!n.read_at,metadata:{type:n.type,actorUserId:n.actor_user_id}});received.push(it);}
    for(const a of activity.filter(x=>allowedProject(x.project_id))) history.push(item({id:a.id,entityType:'ACTIVITY',title:a.summary,description:`${a.entity_type} · ${a.action}`,status:a.action,projectId:a.project_id,createdAt:a.created_at,href:'/activity',section:'history',metadata:a.metadata||{}}));
    for(const e of events.filter(x=>allowedProject(x.project_id))) history.push(item({id:e.id,entityType:e.entity_type,title:`${e.entity_type} · ${String(e.action).replaceAll('_',' ').toLowerCase()}`,description:e.reason||'Workflow action recorded.',status:e.action,projectId:e.project_id,createdAt:e.created_at,href:'/activity',section:'history',metadata:e.metadata||{}}));
    const sort=(a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0);
    const unique=items=>[...new Map(items.map(x=>[x.id,x])).values()].sort(sort).slice(0,100);
    const sections={personal:unique(personal),received:unique(received),sent:unique(sent),review:unique(review),decisions:unique(decisions),history:unique(history)};
    for(const rows of Object.values(sections))for(const row of rows)row.projectName=row.projectId?projectNames.get(row.projectId)||'Assigned project':null;
    return {generatedAt:nowIso(),companyId,userId,role,sections,summary:Object.fromEntries(Object.entries(sections).map(([k,v])=>[k,v.length])),canAct:can('my-work:act')};
  }
  async act({companyId,userId,entityType,entityId,action,reason,payload={}}) {
    const {data,error}=await this.supabase.rpc('perform_my_work_action',{p_company_id:companyId,p_user_id:userId,p_entity_type:entityType,p_entity_id:entityId,p_action:action,p_reason:reason||null,p_payload:payload});
    if(error){
      const msg=String(error.message||'');
      const e=new Error(msg.includes('MY_WORK_')?msg.replaceAll('_',' ').toLowerCase():msg||'Unable to complete this workflow action');
      e.status=msg.includes('FORBIDDEN')||msg.includes('PERMISSION')||msg.includes('ASSIGNMENT')?403:msg.includes('NOT_FOUND')?404:msg.includes('CONFLICT')?409:400;
      e.code=msg.match(/MY_WORK_[A-Z_]+/)?.[0]||'MY_WORK_ACTION_FAILED'; throw e;
    }
    return data;
  }
}
