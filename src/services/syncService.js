import { randomUUID } from "node:crypto";

const ALLOWED = new Set([
  "CREATE_PROJECT","UPDATE_PROJECT","CREATE_TASK","UPDATE_TASK","CREATE_ISSUE","UPDATE_ISSUE",
  "CREATE_REPORT","UPDATE_REPORT","CREATE_ATTENDANCE","UPDATE_ATTENDANCE","CREATE_MATERIAL",
  "CREATE_MATERIAL_REQUEST","INVENTORY_MOVEMENT"
]);

export class SyncService {
  constructor({ supabase, projectService, workService, reportService, workforceService, materialService }) {
    this.supabase = supabase; this.projectService = projectService; this.workService = workService;
    this.reportService = reportService; this.workforceService = workforceService; this.materialService = materialService;
  }
  async findOperation({ companyId, operationId }) {
    const { data, error } = await this.supabase.from("offline_sync_operations").select("*").eq("company_id", companyId).eq("operation_id", operationId).maybeSingle();
    if (error) throw error; return data;
  }
  async currentEntity({ companyId, entityType, entityId }) {
    if (!entityId) return null;
    const table = { PROJECT:"projects", TASK:"tasks", ISSUE:"issues", REPORT:"daily_site_reports", ATTENDANCE:"attendance_records", MATERIAL:"materials", MATERIAL_REQUEST:"material_requests" }[entityType];
    if (!table) return null;
    const { data, error } = await this.supabase.from(table).select("*").eq("company_id", companyId).eq("id", entityId).maybeSingle();
    if (error) throw error; return data;
  }
  async assertNoConflict({ companyId, entityType, entityId, baseUpdatedAt }) {
    if (!baseUpdatedAt || !entityId) return;
    const current = await this.currentEntity({ companyId, entityType, entityId });
    if (!current) return;
    const currentUpdated = current.updated_at || current.created_at;
    if (currentUpdated && new Date(currentUpdated).getTime() !== new Date(baseUpdatedAt).getTime()) {
      const e = new Error("The server record changed while this device was offline");
      e.code = "SYNC_CONFLICT"; e.status = 409; e.conflict = { entityType, entityId, baseUpdatedAt, serverUpdatedAt: currentUpdated, serverRecord: current };
      throw e;
    }
  }
  async apply({ companyId, userId, operationId, operationType, entityType, entityId, baseUpdatedAt, payload }) {
    if (!ALLOWED.has(operationType)) { const e = new Error(`Unsupported offline operation: ${operationType}`); e.code="SYNC_OPERATION_UNSUPPORTED"; e.status=400; throw e; }
    const existing = await this.findOperation({companyId,operationId});
    if (existing) return { replayed:true,status:existing.status,result:existing.result,conflict:existing.conflict };
    try {
      if (operationType.startsWith("UPDATE_")) await this.assertNoConflict({companyId,entityType,entityId,baseUpdatedAt});
      let result;
      switch(operationType) {
        case "CREATE_PROJECT": result=await this.projectService.createProject({companyId,userId,input:{...payload,id:entityId||payload.id}}); break;
        case "UPDATE_PROJECT": result=await this.projectService.updateProject({companyId,projectId:entityId,input:payload}); break;
        case "CREATE_TASK": result=await this.workService.createTask({companyId,projectId:payload.projectId,userId,input:{...payload,id:entityId||payload.id}}); break;
        case "UPDATE_TASK": result=await this.workService.updateTask({companyId,projectId:payload.projectId,taskId:entityId,userId,input:payload}); break;
        case "CREATE_ISSUE": result=await this.workService.createIssue({companyId,projectId:payload.projectId,userId,input:{...payload,id:entityId||payload.id}}); break;
        case "UPDATE_ISSUE": result=await this.workService.updateIssue({companyId,projectId:payload.projectId,issueId:entityId,userId,input:payload}); break;
        case "CREATE_REPORT": result=await this.reportService.createReport({companyId,projectId:payload.projectId,userId,input:{...payload,id:entityId||payload.id}}); break;
        case "UPDATE_REPORT": result=await this.reportService.updateReport({companyId,projectId:payload.projectId,reportId:entityId,userId,input:payload}); break;
        case "CREATE_ATTENDANCE": result=await this.workforceService.recordAttendance({companyId,userId,input:{...payload,id:entityId||payload.id}}); break;
        case "UPDATE_ATTENDANCE": result=await this.workforceService.updateAttendance({companyId,attendanceId:entityId,input:payload}); break;
        case "CREATE_MATERIAL": result=await this.materialService.createMaterial({companyId,userId,input:{...payload,id:entityId||payload.id}}); break;
        case "CREATE_MATERIAL_REQUEST": result=await this.materialService.createRequest({companyId,userId,input:{...payload,id:entityId||payload.id}}); break;
        case "INVENTORY_MOVEMENT": result=await this.materialService.moveStock({companyId,userId,input:payload}); break;
      }
      const { error } = await this.supabase.from("offline_sync_operations").insert({company_id:companyId,user_id:userId,operation_id:operationId,operation_type:operationType,entity_type:entityType,entity_id:result?.id||entityId||null,base_updated_at:baseUpdatedAt||null,payload,result,status:"APPLIED",completed_at:new Date().toISOString()});
      if(error) throw error;
      return {replayed:false,status:"APPLIED",result};
    } catch(error) {
      if (entityId && (error.code === "23505" || /duplicate key/i.test(String(error.message||""))) && operationType.startsWith("CREATE_")) {
        const existingEntityType = entityType === "REPORT" ? "REPORT" : entityType;
        const existing = await this.currentEntity({companyId,entityType:existingEntityType,entityId});
        if (existing) {
          await this.supabase.from("offline_sync_operations").insert({company_id:companyId,user_id:userId,operation_id:operationId,operation_type:operationType,entity_type:entityType,entity_id:entityId,payload,result:existing,status:"APPLIED",completed_at:new Date().toISOString()});
          return {replayed:false,status:"APPLIED",result:existing};
        }
      }
      if(error.code !== "SYNC_CONFLICT") throw error;
      const conflict=error.conflict;
      await this.supabase.from("offline_sync_operations").insert({company_id:companyId,user_id:userId,operation_id:operationId,operation_type:operationType,entity_type:entityType,entity_id:entityId||null,base_updated_at:baseUpdatedAt||null,payload,status:"CONFLICT",conflict,completed_at:new Date().toISOString()});
      throw error;
    }
  }
  async status({companyId,userId,limit=50}) {
    const {data,error}=await this.supabase.from("offline_sync_operations").select("id,operation_id,operation_type,entity_type,entity_id,status,base_updated_at,result,conflict,created_at,completed_at").eq("company_id",companyId).eq("user_id",userId).order("created_at",{ascending:false}).limit(limit);
    if(error)throw error;
    const rows=data??[]; return {items:rows,pending:0,applied:rows.filter(x=>x.status==='APPLIED').length,conflicts:rows.filter(x=>x.status==='CONFLICT').length,failed:rows.filter(x=>x.status==='FAILED').length};
  }
}
