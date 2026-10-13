import { randomUUID } from "node:crypto";
const clean=v=>typeof v==="string"?v.trim():v;
export class MaterialService {
  constructor({supabase}){this.supabase=supabase;}
  async listMaterials({companyId,search,activeOnly=true}){let q=this.supabase.from("materials").select("id,company_id,name,sku,category,unit,reorder_level,active,created_at,updated_at").eq("company_id",companyId).order("name");if(activeOnly)q=q.eq("active",true);if(search)q=q.ilike("name",`%${search}%`);const {data,error}=await q;if(error)throw error;return data??[];}
  async createMaterial({companyId,userId,input}){const row={id:input.id||randomUUID(),company_id:companyId,name:clean(input.name),sku:clean(input.sku)||null,category:clean(input.category)||null,unit:clean(input.unit),reorder_level:input.reorderLevel??0,created_by:userId};const {data,error}=await this.supabase.from("materials").insert(row).select().single();if(error)throw error;return data;}
  async listInventory({companyId,siteId,lowStock=false}){let q=this.supabase.from("inventory_balances").select("id,material_id,site_id,quantity,updated_at,materials:material_id(id,name,sku,unit,reorder_level)").eq("company_id",companyId).order("updated_at",{ascending:false});if(siteId)q=q.eq("site_id",siteId);const {data,error}=await q;if(error)throw error;const rows=data??[];return lowStock?rows.filter(x=>Number(x.quantity)<=Number(x.materials?.reorder_level??0)):rows;}
  async listTransactions({companyId,materialId,siteId,page=1,pageSize=20}){let q=this.supabase.from("inventory_transactions").select("*",{count:"exact"}).eq("company_id",companyId).order("created_at",{ascending:false});if(materialId)q=q.eq("material_id",materialId);if(siteId)q=q.eq("site_id",siteId);const {data,count,error}=await q.range((page-1)*pageSize,page*pageSize-1);if(error)throw error;return {items:data??[],page,pageSize,total:count??0,totalPages:Math.ceil((count??0)/pageSize)};}
  async moveStock({companyId,userId,input}){const {data,error}=await this.supabase.rpc("apply_inventory_transaction",{p_company_id:companyId,p_material_id:input.materialId,p_site_id:input.siteId||null,p_project_id:input.projectId||null,p_type:input.type,p_quantity:input.quantity,p_reference:clean(input.reference)||null,p_notes:clean(input.notes)||null,p_user_id:userId,p_operation_id:input.operationId||null});if(error)throw error;return data;}
  async updateMaterial({ companyId, materialId, input }) {
    const map={name:"name",sku:"sku",category:"category",unit:"unit",reorderLevel:"reorder_level"};
    const patch={}; for(const [k,c] of Object.entries(map)) if(input[k]!==undefined) patch[c]=typeof input[k]==="string"?clean(input[k])||null:input[k];
    const {data,error}=await this.supabase.from("materials").update(patch).eq("company_id",companyId).eq("id",materialId).select().maybeSingle();
    if(error)throw error;
    if(!data){const e=new Error("Material not found");e.code="MATERIAL_NOT_FOUND";e.status=404;throw e;}
    return data;
  }

  async createRequest({companyId,userId,input}){const {data,error}=await this.supabase.rpc("create_material_request",{p_company_id:companyId,p_project_id:input.projectId,p_site_id:input.siteId||null,p_notes:clean(input.notes)||null,p_user_id:userId,p_items:input.items.map(i=>({materialId:i.materialId,quantity:i.quantity})),p_request_id:input.id||null});if(error)throw error;return this.getRequest({companyId,requestId:data.id});}
  async getRequest({companyId,requestId}){const {data,error}=await this.supabase.from("material_requests").select("*,material_request_items(*,materials:material_id(id,name,unit))").eq("company_id",companyId).eq("id",requestId).maybeSingle();if(error)throw error;if(!data){const e=new Error("Material request not found");e.code="MATERIAL_REQUEST_NOT_FOUND";e.status=404;throw e;}return data;}
  async listRequests({companyId,status,page=1,pageSize=20}){let q=this.supabase.from("material_requests").select("*,material_request_items(id,material_id,requested_quantity,issued_quantity)",{count:"exact"}).eq("company_id",companyId).order("created_at",{ascending:false});if(status)q=q.eq("status",status);const {data,count,error}=await q.range((page-1)*pageSize,page*pageSize-1);if(error)throw error;return {items:data??[],page,pageSize,total:count??0,totalPages:Math.ceil((count??0)/pageSize)};}
  async approveRequest({companyId,userId,requestId,approve}){const {data,error}=await this.supabase.rpc("approve_material_request",{p_request_id:requestId,p_company_id:companyId,p_user_id:userId,p_approve:approve});if(error)throw error;return data;}
}
