import { randomUUID } from "node:crypto";

const clean = (v) => typeof v === "string" ? v.trim() : v;

export class WorkService {
  constructor({ supabase }) { this.supabase = supabase; }

  async assertProject({ companyId, projectId }) {
    const { data, error } = await this.supabase.from("projects").select("id,company_id,name").eq("company_id", companyId).eq("id", projectId).maybeSingle();
    if (error) throw error;
    if (!data) { const e = new Error("Project not found"); e.code = "PROJECT_NOT_FOUND"; e.status = 404; throw e; }
    return data;
  }

  async listTasks({ companyId, projectId, page=1, pageSize=20, search, status, priority, assignedTo }) {
    await this.assertProject({ companyId, projectId });
    const from=(page-1)*pageSize, to=from+pageSize-1;
    let q=this.supabase.from("tasks").select("id,company_id,project_id,site_id,milestone_id,title,description,assigned_to,priority,status,due_date,created_by,created_at,updated_at",{count:"exact"}).eq("company_id",companyId).eq("project_id",projectId).order("created_at",{ascending:false}).range(from,to);
    if(status) q=q.eq("status",status); if(priority) q=q.eq("priority",priority); if(assignedTo) q=q.eq("assigned_to",assignedTo); if(search) q=q.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
    const {data,count,error}=await q; if(error) throw error; return {items:data??[],page,pageSize,total:count??0,totalPages:Math.ceil((count??0)/pageSize)};
  }

  async createTask({ companyId, projectId, userId, input }) {
    await this.assertProject({companyId,projectId});
    const row={id:input.id||randomUUID(),company_id:companyId,project_id:projectId,site_id:input.siteId||null,milestone_id:input.milestoneId||null,title:clean(input.title),description:clean(input.description)||null,assigned_to:input.assignedTo||null,priority:input.priority||"MEDIUM",status:input.status||"TODO",due_date:input.dueDate||null,created_by:userId};
    const {data,error}=await this.supabase.from("tasks").insert(row).select().single(); if(error) throw error;
    await this.logActivity({companyId,projectId,actorUserId:userId,entityType:"TASK",entityId:data.id,action:"CREATED",summary:`Task created: ${data.title}`,metadata:{status:data.status,priority:data.priority}}); return data;
  }

  async updateTask({ companyId, projectId, taskId, userId, input }) {
    await this.assertProject({companyId,projectId});
    const {data:before,error:be}=await this.supabase.from("tasks").select("id,title,status,assigned_to").eq("company_id",companyId).eq("project_id",projectId).eq("id",taskId).maybeSingle(); if(be) throw be; if(!before){const e=new Error("Task not found");e.code="TASK_NOT_FOUND";e.status=404;throw e;}
    const map={title:"title",description:"description",siteId:"site_id",milestoneId:"milestone_id",assignedTo:"assigned_to",priority:"priority",status:"status",dueDate:"due_date"}; const patch={}; for(const [k,c] of Object.entries(map)) if(input[k]!==undefined) patch[c]=typeof input[k]==="string"?clean(input[k])||null:input[k];
    const {data,error}=await this.supabase.from("tasks").update(patch).eq("company_id",companyId).eq("project_id",projectId).eq("id",taskId).select().single(); if(error) throw error;
    const action=before.status!==data.status?"STATUS_CHANGED":before.assigned_to!==data.assigned_to?"ASSIGNED":"UPDATED";
    await this.logActivity({companyId,projectId,actorUserId:userId,entityType:"TASK",entityId:data.id,action,summary:`Task ${action.toLowerCase().replace("_"," ")}: ${data.title}`,metadata:{fromStatus:before.status,toStatus:data.status,assignedTo:data.assigned_to}}); return data;
  }

  async deleteTask({companyId,projectId,taskId,userId}) { const {data,error}=await this.supabase.from("tasks").delete().eq("company_id",companyId).eq("project_id",projectId).eq("id",taskId).select("id,title").maybeSingle(); if(error) throw error; if(data) await this.logActivity({companyId,projectId,actorUserId:userId,entityType:"TASK",entityId:data.id,action:"DELETED",summary:`Task deleted: ${data.title}`}); }

  async listIssues({companyId,projectId,page=1,pageSize=20,search,status,severity,assignedTo}) { await this.assertProject({companyId,projectId}); const from=(page-1)*pageSize,to=from+pageSize-1; let q=this.supabase.from("issues").select("id,company_id,project_id,site_id,title,description,severity,status,assigned_to,due_date,created_by,created_at,updated_at",{count:"exact"}).eq("company_id",companyId).eq("project_id",projectId).order("created_at",{ascending:false}).range(from,to); if(status)q=q.eq("status",status);if(severity)q=q.eq("severity",severity);if(assignedTo)q=q.eq("assigned_to",assignedTo);if(search)q=q.or(`title.ilike.%${search}%,description.ilike.%${search}%`);const {data,count,error}=await q;if(error)throw error;return{items:data??[],page,pageSize,total:count??0,totalPages:Math.ceil((count??0)/pageSize)}; }

  async createIssue({companyId,projectId,userId,input}) { await this.assertProject({companyId,projectId}); const row={id:input.id||randomUUID(),company_id:companyId,project_id:projectId,site_id:input.siteId||null,title:clean(input.title),description:clean(input.description)||null,severity:input.severity||"MEDIUM",status:input.status||"OPEN",assigned_to:input.assignedTo||null,due_date:input.dueDate||null,created_by:userId}; const {data,error}=await this.supabase.from("issues").insert(row).select().single();if(error)throw error;await this.logActivity({companyId,projectId,actorUserId:userId,entityType:"ISSUE",entityId:data.id,action:"CREATED",summary:`Issue reported: ${data.title}`,metadata:{severity:data.severity,status:data.status}});return data; }

  async updateIssue({companyId,projectId,issueId,userId,input}) { await this.assertProject({companyId,projectId}); const {data:before,error:be}=await this.supabase.from("issues").select("id,title,status,assigned_to").eq("company_id",companyId).eq("project_id",projectId).eq("id",issueId).maybeSingle();if(be)throw be;if(!before){const e=new Error("Issue not found");e.code="ISSUE_NOT_FOUND";e.status=404;throw e;} const map={title:"title",description:"description",siteId:"site_id",severity:"severity",status:"status",assignedTo:"assigned_to",dueDate:"due_date"};const patch={};for(const[k,c]of Object.entries(map))if(input[k]!==undefined)patch[c]=typeof input[k]==="string"?clean(input[k])||null:input[k];const {data,error}=await this.supabase.from("issues").update(patch).eq("company_id",companyId).eq("project_id",projectId).eq("id",issueId).select().single();if(error)throw error;const action=before.status!==data.status?"STATUS_CHANGED":before.assigned_to!==data.assigned_to?"ASSIGNED":"UPDATED";await this.logActivity({companyId,projectId,actorUserId:userId,entityType:"ISSUE",entityId:data.id,action,summary:`Issue ${action.toLowerCase().replace("_"," ")}: ${data.title}`,metadata:{fromStatus:before.status,toStatus:data.status}});return data; }

  async deleteIssue({companyId,projectId,issueId,userId}) { const {data,error}=await this.supabase.from("issues").delete().eq("company_id",companyId).eq("project_id",projectId).eq("id",issueId).select("id,title").maybeSingle();if(error)throw error;if(data)await this.logActivity({companyId,projectId,actorUserId:userId,entityType:"ISSUE",entityId:data.id,action:"DELETED",summary:`Issue deleted: ${data.title}`}); }

  async listActivity({companyId,projectId,page=1,pageSize=30}) { await this.assertProject({companyId,projectId}); const from=(page-1)*pageSize,to=from+pageSize-1;const {data,count,error}=await this.supabase.from("project_activity").select("id,company_id,project_id,actor_user_id,entity_type,entity_id,action,summary,metadata,created_at,profiles:actor_user_id(id,full_name,avatar_url)",{count:"exact"}).eq("company_id",companyId).eq("project_id",projectId).order("created_at",{ascending:false}).range(from,to);if(error)throw error;return{items:data??[],page,pageSize,total:count??0,totalPages:Math.ceil((count??0)/pageSize)}; }

  async logActivity({companyId,projectId,actorUserId,entityType,entityId,action,summary,metadata={}}) { const {error}=await this.supabase.from("project_activity").insert({id:randomUUID(),company_id:companyId,project_id:projectId,actor_user_id:actorUserId,entity_type:entityType,entity_id:entityId,action,summary,metadata});if(error)throw error; }
}
