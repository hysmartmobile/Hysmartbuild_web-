import { randomUUID } from "node:crypto";

function clean(value) { return typeof value === "string" ? value.trim() : value; }

export class ProjectService {
  constructor({ supabase }) { this.supabase = supabase; }

  async listProjects({ companyId, page = 1, pageSize = 20, search, status }) {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    let query = this.supabase.from("projects").select("id,company_id,name,code,description,client_name,status,start_date,expected_end_date,actual_end_date,budget,progress,lifecycle_phase,priority,health_status,currency,contract_value,client_contact,project_manager_user_id,notes,construction_type,created_by,created_at,updated_at", { count: "exact" }).eq("company_id", companyId).order("created_at", { ascending: false }).range(from, to);
    if (status) query = query.eq("status", status);
    if (search) query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%,client_name.ilike.%${search}%`);
    const { data, count, error } = await query;
    if (error) throw error;
    return { items: data ?? [], page, pageSize, total: count ?? 0, totalPages: Math.ceil((count ?? 0) / pageSize) };
  }

  async getProject({ companyId, projectId }) {
    const { data, error } = await this.supabase.from("projects").select("id,company_id,name,code,description,client_name,status,start_date,expected_end_date,actual_end_date,budget,progress,lifecycle_phase,priority,health_status,currency,contract_value,client_contact,project_manager_user_id,notes,construction_type,created_by,created_at,updated_at").eq("company_id", companyId).eq("id", projectId).maybeSingle();
    if (error) throw error;
    return data;
  }

  async createProject({ companyId, userId, input }) {
    if (typeof this.supabase.rpc === "function") {
      const { error: limitError } = await this.supabase.rpc("enforce_company_limit", { p_company_id: companyId, p_resource: "projects", p_increment: 1 });
      if (limitError) {
        const message=String(limitError.message||"");
        if (message.includes("SUBSCRIPTION_LIMIT_EXCEEDED")) { const e=new Error("Project limit for the active subscription has been reached"); e.code="SUBSCRIPTION_LIMIT_EXCEEDED"; e.status=402; throw e; }
        if (message.includes("SUBSCRIPTION_REQUIRED")) { const e=new Error("An active subscription is required to create projects"); e.code="SUBSCRIPTION_REQUIRED"; e.status=402; throw e; }
        throw limitError;
      }
    }
    const { data, error } = await this.supabase.from("projects").insert({ id: input.id || randomUUID(), company_id: companyId, created_by: userId, name: clean(input.name), code: clean(input.code) || null, description: clean(input.description) || null, client_name: clean(input.clientName) || null, status: input.status || "PLANNING", start_date: input.startDate || (input.status === "ACTIVE" ? new Date().toISOString().slice(0,10) : null), expected_end_date: input.expectedEndDate || null, budget: input.budget ?? 0, progress: input.progress ?? 0, lifecycle_phase: input.lifecyclePhase || "PRECONSTRUCTION", priority: input.priority || "NORMAL", health_status: input.healthStatus || "GREEN", currency: input.currency || "NGN", contract_value: input.contractValue ?? 0, client_contact: clean(input.clientContact) || null, project_manager_user_id: input.projectManagerUserId || null, notes: clean(input.notes) || null, construction_type: input.constructionType || "BUILDING" }).select().single();
    if (error) throw error;
    return data;
  }

  async updateProject({ companyId, projectId, input }) {
    if (input.status !== undefined) {
      const {data:current,error:findError}=await this.supabase.from("projects").select("status").eq("company_id",companyId).eq("id",projectId).maybeSingle();
      if(findError)throw findError;
      if(!current){const e=new Error("Project not found");e.code="PROJECT_NOT_FOUND";e.status=404;throw e;}
      if(input.status!==current.status){const e=new Error("Use the project status workflow to change status");e.code="STATUS_TRANSITION_REQUIRED";e.status=409;throw e;}
    }
    const patch = {};
    const map = { name: "name", code: "code", description: "description", clientName: "client_name", startDate: "start_date", expectedEndDate: "expected_end_date", actualEndDate: "actual_end_date", budget: "budget", progress: "progress", lifecyclePhase: "lifecycle_phase", priority: "priority", healthStatus: "health_status", currency: "currency", contractValue: "contract_value", clientContact: "client_contact", projectManagerUserId: "project_manager_user_id", notes: "notes", constructionType: "construction_type" };
    for (const [key, column] of Object.entries(map)) if (input[key] !== undefined) patch[column] = typeof input[key] === "string" ? clean(input[key]) || null : input[key];
    const { data, error } = await this.supabase.from("projects").update(patch).eq("company_id", companyId).eq("id", projectId).select().single();
    if (error) throw error;
    return data;
  }

  async deleteProject({ companyId, projectId }) {
    const { error } = await this.supabase.from("projects").delete().eq("company_id", companyId).eq("id", projectId);
    if (error) throw error;
  }

  async listSites({ companyId, projectId }) {
    let query = this.supabase.from("sites").select("id,company_id,project_id,name,address,city,state,latitude,longitude,status,created_at,updated_at").eq("company_id", companyId).eq("project_id", projectId).order("created_at", { ascending: false });
    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  }

  async createSite({ companyId, projectId, input }) {
    const { data, error } = await this.supabase.from("sites").insert({ id: randomUUID(), company_id: companyId, project_id: projectId, name: clean(input.name), address: clean(input.address) || null, city: clean(input.city) || null, state: clean(input.state) || null, latitude: input.latitude ?? null, longitude: input.longitude ?? null, status: input.status || "ACTIVE" }).select().single();
    if (error) throw error;
    return data;
  }

  async updateSite({ companyId, projectId, siteId, input }) {
    const { data: site, error: findError } = await this.supabase.from("sites").select("id,project_id").eq("company_id", companyId).eq("project_id", projectId).eq("id", siteId).maybeSingle();
    if (findError) throw findError;
    if (!site) { const e=new Error("Site not found"); e.code="SITE_NOT_FOUND"; e.status=404; throw e; }
    const map={name:"name",address:"address",city:"city",state:"state",latitude:"latitude",longitude:"longitude",status:"status"};
    const patch={}; for(const [k,c] of Object.entries(map)) if(input[k]!==undefined) patch[c]=typeof input[k]==="string"?clean(input[k])||null:input[k];
    const {data,error}=await this.supabase.from("sites").update(patch).eq("company_id",companyId).eq("project_id",projectId).eq("id",siteId).select().single();
    if(error)throw error; return data;
  }

  async deleteSite({ companyId, projectId, siteId }) {
    const { data, error } = await this.supabase.from("sites").delete().eq("company_id",companyId).eq("project_id",projectId).eq("id",siteId).select("id").maybeSingle();
    if(error)throw error;
    if(!data){const e=new Error("Site not found");e.code="SITE_NOT_FOUND";e.status=404;throw e;}
  }

  async listTeam({ companyId, projectId }) {
    const { data, error } = await this.supabase.from("project_members").select("id,company_id,project_id,user_id,role,status,created_at,profiles!project_members_user_profile_fk(id,full_name,phone,avatar_url)").eq("company_id", companyId).eq("project_id", projectId).order("created_at", { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  async addTeamMember({ companyId, projectId, userId, role }) {
    const { data, error } = await this.supabase.from("project_members").insert({ id: randomUUID(), company_id: companyId, project_id: projectId, user_id: userId, role }).select("id,company_id,project_id,user_id,role,status,created_at").single();
    if (error) throw error;
    return data;
  }

  async updateTeamMember({ companyId, projectId, userId, role }) {
    const { data, error } = await this.supabase.from("project_members").update({role})
      .eq("company_id",companyId).eq("project_id",projectId).eq("user_id",userId)
      .select("id,company_id,project_id,user_id,role,status,updated_at").maybeSingle();
    if(error)throw error;
    if(!data){const e=new Error("Project team member not found");e.code="PROJECT_TEAM_MEMBER_NOT_FOUND";e.status=404;throw e;}
    return data;
  }

  async removeTeamMember({ companyId, projectId, userId }) {
    const { error } = await this.supabase.from("project_members").delete().eq("company_id", companyId).eq("project_id", projectId).eq("user_id", userId);
    if (error) throw error;
  }

  async listMilestones({ companyId, projectId }) {
    const { data, error } = await this.supabase.from("milestones").select("id,company_id,project_id,title,description,due_date,status,progress,created_by,created_at,updated_at").eq("company_id", companyId).eq("project_id", projectId).order("due_date", { ascending: true, nullsFirst: false });
    if (error) throw error;
    return data ?? [];
  }

  async createMilestone({ companyId, projectId, userId, input }) {
    const { data, error } = await this.supabase.from("milestones").insert({ id: randomUUID(), company_id: companyId, project_id: projectId, created_by: userId, title: clean(input.title), description: clean(input.description) || null, due_date: input.dueDate || null, status: input.status || "PENDING", progress: input.progress ?? 0 }).select().single();
    if (error) throw error;
    return data;
  }

  async updateMilestone({ companyId, projectId, milestoneId, input }) {
    const patch = {};
    for (const [key, column] of Object.entries({ title: "title", description: "description", dueDate: "due_date", status: "status", progress: "progress" })) if (input[key] !== undefined) patch[column] = typeof input[key] === "string" ? clean(input[key]) || null : input[key];
    const { data, error } = await this.supabase.from("milestones").update(patch).eq("company_id", companyId).eq("project_id", projectId).eq("id", milestoneId).select().single();
    if (error) throw error;
    return data;
  }

  async deleteMilestone({ companyId, projectId, milestoneId }) {
    const { data, error } = await this.supabase.from("milestones").delete()
      .eq("company_id",companyId).eq("project_id",projectId).eq("id",milestoneId)
      .select("id").maybeSingle();
    if(error)throw error;
    if(!data){const e=new Error("Milestone not found");e.code="MILESTONE_NOT_FOUND";e.status=404;throw e;}
  }

  async transitionProject({companyId,projectId,userId,toStatus,reason}) {
    const { data: current, error: findError } = await this.supabase.from("projects").select("*").eq("company_id",companyId).eq("id",projectId).maybeSingle();
    if (findError) throw findError;
    if (!current) { const e=new Error("Project not found"); e.code="PROJECT_NOT_FOUND"; e.status=404; throw e; }
    const allowed = {PLANNING:["ACTIVE","CANCELLED"],ACTIVE:["ON_HOLD","COMPLETED","CANCELLED"],ON_HOLD:["ACTIVE","COMPLETED","CANCELLED"],COMPLETED:[],CANCELLED:[]};
    if (!allowed[current.status]?.includes(toStatus)) { const e=new Error(`Invalid project transition: ${current.status} → ${toStatus}`); e.code="INVALID_PROJECT_TRANSITION"; e.status=409; throw e; }
    const patch={status:toStatus};
    if (toStatus === "ACTIVE" && !current.start_date) patch.start_date=new Date().toISOString().slice(0,10);
    if (toStatus === "COMPLETED") { patch.actual_end_date=new Date().toISOString().slice(0,10); patch.progress=100; }
    const {data,error}=await this.supabase.from("projects").update(patch).eq("company_id",companyId).eq("id",projectId).select().single();
    if(error)throw error;
    await this.supabase.from("project_status_history").insert({id:randomUUID(),company_id:companyId,project_id:projectId,from_status:current.status,to_status:toStatus,reason:clean(reason)||null,changed_by:userId});
    return data;
  }

  async listStatusHistory({companyId,projectId}) { const {data,error}=await this.supabase.from("project_status_history").select("id,from_status,to_status,reason,changed_by,created_at").eq("company_id",companyId).eq("project_id",projectId).order("created_at",{ascending:false}); if(error)throw error; return data||[]; }

  async getControlCenter({companyId,projectId}) {
    const project=await this.getProject({companyId,projectId}); if(!project){const e=new Error("Project not found");e.code="PROJECT_NOT_FOUND";e.status=404;throw e;}
    const [tasks,issues,milestones,reports,expenses,budgetLines,risks,changeOrders,checklists,sites,team,costLedger]=await Promise.all([
      this.supabase.from("tasks").select("id,status,priority",{count:"exact",head:false}).eq("company_id",companyId).eq("project_id",projectId),
      this.supabase.from("issues").select("id,status,severity",{count:"exact",head:false}).eq("company_id",companyId).eq("project_id",projectId),
      this.supabase.from("milestones").select("id,status,progress,due_date").eq("company_id",companyId).eq("project_id",projectId),
      this.supabase.from("daily_site_reports").select("id,status,report_date",{count:"exact",head:false}).eq("company_id",companyId).eq("project_id",projectId),
      this.supabase.from("expenses").select("amount,status").eq("company_id",companyId).eq("project_id",projectId),
      this.listBudgetLines({companyId,projectId}),this.listRisks({companyId,projectId}),this.listChangeOrders({companyId,projectId}),this.listChecklists({companyId,projectId}),this.listSites({companyId,projectId}),this.listTeam({companyId,projectId}),
      this.supabase.from("project_cost_ledger_v").select("entry_type,amount").eq("company_id",companyId).eq("project_id",projectId)
    ]);
    for(const x of [tasks,issues,milestones,reports,expenses]) if(x.error && !String(x.error.message).toLowerCase().includes('relation')) throw x.error;
    const taskRows=tasks.data||[], issueRows=issues.data||[], milestoneRows=milestones.data||[], expenseRows=expenses.data||[];
    const budgetTotal=(budgetLines||[]).reduce((s,x)=>s+Number(x.budget_amount||0),0);
    const ledgerRows=costLedger?.error?[]:(costLedger.data||[]);
    const committedTotal=ledgerRows.length?ledgerRows.filter(x=>x.entry_type==='COMMITMENT').reduce((sum,x)=>sum+Number(x.amount||0),0):(budgetLines||[]).reduce((sum,x)=>sum+Number(x.committed_amount||0),0);
    const actualLines=ledgerRows.length?ledgerRows.filter(x=>x.entry_type==='ACTUAL').reduce((sum,x)=>sum+Number(x.amount||0),0):(budgetLines||[]).reduce((sum,x)=>sum+Number(x.actual_amount||0),0);
    const actualExpenses=expenseRows.filter(x=>x.status!=='REJECTED'&&x.status!=='CANCELLED').reduce((sum,x)=>sum+Number(x.amount||0),0);
    return {project,summary:{tasks:taskRows.length,openTasks:taskRows.filter(x=>!['DONE','COMPLETED'].includes(x.status)).length,issues:issueRows.length,openIssues:issueRows.filter(x=>!['RESOLVED','CLOSED'].includes(x.status)).length,milestones:milestoneRows.length,completedMilestones:milestoneRows.filter(x=>x.status==='COMPLETED').length,sites:(sites||[]).length,team:(team||[]).length,expenses:actualExpenses,budget:budgetTotal||Number(project.budget||0),committed:committedTotal,actual:actualLines||actualExpenses,variance:(budgetTotal||Number(project.budget||0))-(actualLines||actualExpenses)},risks,changeOrders,checklists,budgetLines,milestones:milestoneRows,history:await this.listStatusHistory({companyId,projectId})};
  }

  async listBudgetLines({companyId,projectId}) { const {data,error}=await this.supabase.from("project_budget_lines").select("*").eq("company_id",companyId).eq("project_id",projectId).order("created_at",{ascending:false});if(error)throw error;return data||[]; }
  async createBudgetLine({companyId,projectId,userId,input}) { const {data,error}=await this.supabase.from("project_budget_lines").insert({id:randomUUID(),company_id:companyId,project_id:projectId,cost_code:clean(input.costCode)||null,category:clean(input.category),description:clean(input.description),budget_amount:input.budgetAmount,committed_amount:0,actual_amount:0,created_by:userId}).select().single();if(error)throw error;return data; }
  async listRisks({companyId,projectId}) { const {data,error}=await this.supabase.from("project_risks").select("*").eq("company_id",companyId).eq("project_id",projectId).order("created_at",{ascending:false});if(error)throw error;return data||[]; }
  async createRisk({companyId,projectId,userId,input}) { const {data,error}=await this.supabase.from("project_risks").insert({id:randomUUID(),company_id:companyId,project_id:projectId,title:clean(input.title),description:clean(input.description)||null,probability:input.probability||3,impact:input.impact||3,status:input.status||'OPEN',mitigation:clean(input.mitigation)||null,owner_user_id:input.ownerUserId||null,due_date:input.dueDate||null,created_by:userId}).select().single();if(error)throw error;return data; }
  async updateRisk({companyId,projectId,riskId,input}) { const map={title:'title',description:'description',probability:'probability',impact:'impact',status:'status',mitigation:'mitigation',ownerUserId:'owner_user_id',dueDate:'due_date'},patch={};for(const[k,c]of Object.entries(map))if(input[k]!==undefined)patch[c]=typeof input[k]==='string'?clean(input[k])||null:input[k];const {data,error}=await this.supabase.from('project_risks').update(patch).eq('company_id',companyId).eq('project_id',projectId).eq('id',riskId).select().single();if(error)throw error;return data; }
  async listChangeOrders({companyId,projectId}) { const {data,error}=await this.supabase.from('project_change_orders').select('*').eq('company_id',companyId).eq('project_id',projectId).order('created_at',{ascending:false});if(error)throw error;return data||[]; }
  async createChangeOrder({companyId,projectId,userId,input}) { const {data,error}=await this.supabase.from('project_change_orders').insert({id:randomUUID(),company_id:companyId,project_id:projectId,change_no:clean(input.changeNo),title:clean(input.title),description:clean(input.description)||null,amount:input.amount,cost_impact:Number(input.costImpact||input.amount||0),time_impact_days:Number(input.timeImpactDays||0),status:'DRAFT',requested_date:input.requestedDate||new Date().toISOString().slice(0,10),created_by:userId}).select().single();if(error)throw error;return data; }
  async transitionChangeOrder({companyId,projectId,changeOrderId,userId,status,approvalNotes,clientApproved}) {
    const { data: current, error } = await this.supabase.from('project_change_orders').select('*').eq('company_id',companyId).eq('project_id',projectId).eq('id',changeOrderId).single();
    if (error) throw error;
    const allowed={DRAFT:['SUBMITTED','CANCELLED'],SUBMITTED:['APPROVED','REJECTED','CANCELLED'],APPROVED:['CANCELLED'],REJECTED:['DRAFT'],CANCELLED:[]};
    if (!allowed[current.status]?.includes(status)) { const e=new Error(`Invalid change-order transition: ${current.status} -> ${status}`); e.status=409; e.code='INVALID_CHANGE_ORDER_TRANSITION'; throw e; }
    const patch={status};
    if(status==='APPROVED'){patch.approved_by=userId;patch.approved_date=new Date().toISOString().slice(0,10);patch.approval_notes=clean(approvalNotes)||null;}
    if(clientApproved!==undefined){patch.client_approved=Boolean(clientApproved);if(clientApproved)patch.client_approved_date=new Date().toISOString().slice(0,10);}
    const {data,error:ue}=await this.supabase.from('project_change_orders').update(patch).eq('company_id',companyId).eq('project_id',projectId).eq('id',changeOrderId).select().single();
    if(ue)throw ue;return data;
  }

  async updateChangeOrder({companyId,projectId,changeOrderId,input}) { const map={changeNo:'change_no',title:'title',description:'description',amount:'amount',costImpact:'cost_impact',timeImpactDays:'time_impact_days',requestedDate:'requested_date'},patch={};for(const[k,c]of Object.entries(map))if(input[k]!==undefined)patch[c]=typeof input[k]==='string'?clean(input[k])||null:input[k];const {data,error}=await this.supabase.from('project_change_orders').update(patch).eq('company_id',companyId).eq('project_id',projectId).eq('id',changeOrderId).eq('status','DRAFT').select().single();if(error)throw error;return data; }
  async listChecklists({companyId,projectId}) { const {data,error}=await this.supabase.from('project_checklists').select('*').eq('company_id',companyId).eq('project_id',projectId).order('created_at',{ascending:false});if(error)throw error;return data||[]; }
  async createChecklist({companyId,projectId,userId,input}) { const {data,error}=await this.supabase.from('project_checklists').insert({id:randomUUID(),company_id:companyId,project_id:projectId,phase:clean(input.phase),title:clean(input.title),description:clean(input.description)||null,status:input.status||'OPEN',due_date:input.dueDate||null,assigned_to:input.assignedTo||null,created_by:userId}).select().single();if(error)throw error;return data; }
  async updateChecklist({companyId,projectId,checklistId,input}) { const map={phase:'phase',title:'title',description:'description',status:'status',dueDate:'due_date',assignedTo:'assigned_to'},patch={};for(const[k,c]of Object.entries(map))if(input[k]!==undefined)patch[c]=typeof input[k]==='string'?clean(input[k])||null:input[k];if(input.status==='DONE')patch.completed_at=new Date().toISOString();const {data,error}=await this.supabase.from('project_checklists').update(patch).eq('company_id',companyId).eq('project_id',projectId).eq('id',checklistId).select().single();if(error)throw error;return data; }

}
