import { randomUUID } from "node:crypto";
const clean = (v) => typeof v === "string" ? v.trim() : v;

export class FinanceService {
  constructor({ supabase }) { this.supabase = supabase; }
  async assertProject({ companyId, projectId }) {
    if (!projectId) return null;
    const { data, error } = await this.supabase.from("projects").select("id,company_id,name").eq("company_id", companyId).eq("id", projectId).maybeSingle();
    if (error) throw error; if (!data) { const e=new Error("Project not found"); e.code="PROJECT_NOT_FOUND"; e.status=404; throw e; } return data;
  }
  async assertSite({ companyId, siteId }) {
    if (!siteId) return null;
    const { data, error } = await this.supabase.from("sites").select("id,company_id,project_id,name").eq("company_id", companyId).eq("id", siteId).maybeSingle();
    if (error) throw error; if (!data) { const e=new Error("Site not found"); e.code="SITE_NOT_FOUND"; e.status=404; throw e; } return data;
  }
  async listExpenses({companyId,projectId,siteId,status,fromDate,toDate,search,page=1,pageSize=50}) {
    const from=(page-1)*pageSize,to=from+pageSize-1;
    let q=this.supabase.from("expenses").select("id,company_id,project_id,site_id,submitted_by,category,description,vendor_name,amount,currency,expense_date,status,approved_by,approved_at,rejection_reason,receipt_path,notes,estimate_item_id,supplier_invoice_id,created_at,updated_at",{count:"exact"}).eq("company_id",companyId).order("expense_date",{ascending:false}).order("created_at",{ascending:false});
    if(projectId) q=q.eq("project_id",projectId); if(siteId) q=q.eq("site_id",siteId); if(status) q=q.eq("status",status); if(fromDate) q=q.gte("expense_date",fromDate); if(toDate) q=q.lte("expense_date",toDate); if(search) q=q.or(`description.ilike.%${search}%,category.ilike.%${search}%,vendor_name.ilike.%${search}%`);
    const {data,count,error}=await q.range(from,to); if(error) throw error; return {items:data??[],page,pageSize,total:count??0,totalPages:Math.ceil((count??0)/pageSize)};
  }
  async createExpense({companyId,userId,input}) {
    await this.assertProject({companyId,projectId:input.projectId}); const site=await this.assertSite({companyId,siteId:input.siteId});
    if(site?.project_id && input.projectId && site.project_id!==input.projectId){const e=new Error("Site does not belong to the selected project");e.code="SITE_PROJECT_MISMATCH";e.status=400;throw e;}
    let projectId=input.projectId||site?.project_id||null;
    if(input.estimateItemId){
      const {data:item,error}=await this.supabase.from("project_estimate_items").select("id,company_id,estimate:estimate_id!inner(project_id)").eq("company_id",companyId).eq("id",input.estimateItemId).maybeSingle();
      if(error)throw error;if(!item){const e=new Error("BOQ item not found for this company");e.code="BOQ_ITEM_NOT_FOUND";e.status=404;throw e;}
      const itemProjectId=item.estimate?.project_id||null;
      if(projectId&&itemProjectId&&projectId!==itemProjectId){const e=new Error("BOQ item does not belong to the selected project");e.code="BOQ_PROJECT_MISMATCH";e.status=400;throw e;}
      if(site?.project_id&&itemProjectId&&site.project_id!==itemProjectId){const e=new Error("BOQ item does not belong to the selected site project");e.code="BOQ_PROJECT_MISMATCH";e.status=400;throw e;}
      projectId=projectId||itemProjectId;
    }
    if(input.supplierInvoiceId){
      const {data:invoice,error}=await this.supabase.from("supplier_invoices").select("id,company_id,currency,purchase_order_id").eq("company_id",companyId).eq("id",input.supplierInvoiceId).maybeSingle();
      if(error)throw error;if(!invoice){const e=new Error("Supplier invoice not found for this company");e.code="SUPPLIER_INVOICE_NOT_FOUND";e.status=404;throw e;}
      if(invoice.currency&&input.currency&&invoice.currency.toUpperCase()!==input.currency.toUpperCase()){const e=new Error("Expense currency must match the linked supplier invoice currency");e.code="INVOICE_CURRENCY_MISMATCH";e.status=400;throw e;}
      if(invoice.purchase_order_id){
        const {data:po,error:poError}=await this.supabase.from("purchase_orders").select("id,project_id").eq("company_id",companyId).eq("id",invoice.purchase_order_id).maybeSingle();
        if(poError)throw poError;if(!po){const e=new Error("Purchase order for linked supplier invoice was not found");e.code="PURCHASE_ORDER_NOT_FOUND";e.status=404;throw e;}
        if(projectId&&po.project_id&&projectId!==po.project_id){const e=new Error("Supplier invoice does not belong to the selected project");e.code="INVOICE_PROJECT_MISMATCH";e.status=400;throw e;}
        projectId=projectId||po.project_id||null;
      }
    }
    const row={id:randomUUID(),company_id:companyId,project_id:projectId,site_id:input.siteId||null,estimate_item_id:input.estimateItemId||null,supplier_invoice_id:input.supplierInvoiceId||null,submitted_by:userId,category:clean(input.category),description:clean(input.description),vendor_name:clean(input.vendorName)||null,amount:Number(input.amount),currency:input.currency||"NGN",expense_date:input.expenseDate,status:"PENDING",receipt_path:clean(input.receiptPath)||null,notes:clean(input.notes)||null};
    const {data,error}=await this.supabase.from("expenses").insert(row).select().single(); if(error) throw error; return data;
  }
  async updateExpense({companyId,expenseId,input}) {
    const map={category:"category",description:"description",vendorName:"vendor_name",amount:"amount",currency:"currency",expenseDate:"expense_date",receiptPath:"receipt_path",notes:"notes",estimateItemId:"estimate_item_id",supplierInvoiceId:"supplier_invoice_id"}; const patch={}; for(const[k,c] of Object.entries(map)) if(input[k]!==undefined) patch[c]=typeof input[k]==="string"?clean(input[k])||null:input[k];
    const {data,error}=await this.supabase.from("expenses").update(patch).eq("company_id",companyId).eq("id",expenseId).eq("status","PENDING").select().single(); if(error) throw error; return data;
  }
  async decideExpense({companyId,expenseId,userId,decision,reason}) {
    const action=decision==="APPROVED"?"APPROVE":"REJECT";
    const {data,error}=await this.supabase.rpc("perform_my_work_action",{p_company_id:companyId,p_user_id:userId,p_entity_type:"EXPENSE",p_entity_id:expenseId,p_action:action,p_reason:reason||null,p_payload:{}});
    if(error) throw error;
    return data?.item??data;
  }
  async markPaid({companyId,expenseId,userId,reference}) {
    const {data,error}=await this.supabase.rpc("mark_expense_paid",{p_company_id:companyId,p_expense_id:expenseId,p_user_id:userId,p_reference:reference||null}); if(error) throw error; return data;
  }
  async listApprovals({companyId,expenseId}) { let q=this.supabase.from("expense_approvals").select("id,expense_id,actor_user_id,decision,reason,created_at").eq("company_id",companyId).order("created_at",{ascending:false}); if(expenseId) q=q.eq("expense_id",expenseId); const {data,error}=await q; if(error) throw error; return data??[]; }
  async listFinancialRecords({companyId,projectId,siteId,recordType,fromDate,toDate,page=1,pageSize=50}) { const from=(page-1)*pageSize,to=from+pageSize-1; let q=this.supabase.from("financial_records").select("id,company_id,project_id,site_id,expense_id,record_type,reference,description,amount,currency,record_date,recorded_by,created_at",{count:"exact"}).eq("company_id",companyId).order("record_date",{ascending:false}).order("created_at",{ascending:false}); if(projectId)q=q.eq("project_id",projectId);if(siteId)q=q.eq("site_id",siteId);if(recordType)q=q.eq("record_type",recordType);if(fromDate)q=q.gte("record_date",fromDate);if(toDate)q=q.lte("record_date",toDate);const {data,count,error}=await q.range(from,to);if(error)throw error;return {items:data??[],page,pageSize,total:count??0,totalPages:Math.ceil((count??0)/pageSize)}; }
  async createFinancialRecord({companyId,userId,input}) { await this.assertProject({companyId,projectId:input.projectId}); const site=await this.assertSite({companyId,siteId:input.siteId}); if(site?.project_id&&input.projectId&&site.project_id!==input.projectId){const e=new Error("Site does not belong to selected project");e.code="SITE_PROJECT_MISMATCH";e.status=400;throw e;} const row={id:randomUUID(),company_id:companyId,project_id:input.projectId||site?.project_id||null,site_id:input.siteId||null,expense_id:input.expenseId||null,record_type:input.recordType,reference:clean(input.reference)||null,description:clean(input.description),amount:Number(input.amount),currency:input.currency||"NGN",record_date:input.recordDate,recorded_by:userId}; const {data,error}=await this.supabase.from("financial_records").insert(row).select().single();if(error)throw error;return data; }
  async summary({companyId,fromDate,toDate,projectId}) { const result=await this.listFinancialRecords({companyId,fromDate,toDate,projectId,page:1,pageSize:1000}); const s={income:0,expense:0,payment:0,refund:0,transfer:0,adjustment:0}; for(const r of result.items) s[r.record_type.toLowerCase()]+=Number(r.amount); return {...s,netIncome:s.income-s.payment-s.expense+s.refund}; }
}
