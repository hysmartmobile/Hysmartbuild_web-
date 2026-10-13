import test from "node:test";
import assert from "node:assert/strict";
import { FinanceService } from "../src/services/financeService.js";
import { createAuthorizationMiddleware } from "../src/middleware/authorize.js";
function responseRecorder(){return {status(code){this.code=code;return this;},json(body){this.body=body;return this;}};}

test("expense creation is tenant-bound and uses authenticated submitter", async()=>{let payload;const supabase={from(table){assert.equal(table,"expenses");return {insert(row){payload=row;return this;},select(){return this;},single:async()=>({data:{id:"e1",...payload},error:null})};}};const service=new FinanceService({supabase});const out=await service.createExpense({companyId:"c1",userId:"u1",input:{category:"Fuel",description:"Diesel",amount:120000,expenseDate:"2026-10-01"}});assert.equal(out.company_id,"c1");assert.equal(payload.submitted_by,"u1");assert.equal(payload.status,"PENDING");});

test("expense approval delegates to guarded database RPC", async()=>{let args;const supabase={rpc(name,payload){assert.equal(name,"approve_expense");args=payload;return Promise.resolve({data:{id:"e1",status:"APPROVED"},error:null});}};const service=new FinanceService({supabase});const out=await service.decideExpense({companyId:"c1",expenseId:"e1",userId:"u1",decision:"APPROVED",reason:"Verified"});assert.equal(out.status,"APPROVED");assert.deepEqual(args,{p_company_id:"c1",p_expense_id:"e1",p_user_id:"u1",p_decision:"APPROVED",p_reason:"Verified"});});

test("payment delegates to guarded database RPC",async()=>{let args;const supabase={rpc(name,payload){assert.equal(name,"mark_expense_paid");args=payload;return Promise.resolve({data:{id:"e1",status:"PAID"},error:null});}};const service=new FinanceService({supabase});await service.markPaid({companyId:"c1",expenseId:"e1",userId:"u1",reference:"PAY-01"});assert.equal(args.p_user_id,"u1");assert.equal(args.p_reference,"PAY-01");});

test("accountant can approve expenses when permission is present",async()=>{const authorize=createAuthorizationMiddleware({rbacService:{getAuthorization:async()=>({company_id:"c1",user_id:"u1",role:"ACCOUNTANT",permissions:["expense:approve"]})}});const req={user:{id:"u1"},params:{companyId:"c1"}};const res=responseRecorder();let next=false;await authorize("expense:approve")(req,res,()=>{next=true});assert.equal(next,true);});

test("worker cannot access finance records",async()=>{const authorize=createAuthorizationMiddleware({rbacService:{getAuthorization:async()=>({company_id:"c1",user_id:"u1",role:"WORKER",permissions:["worker:read"]})}});const req={user:{id:"u1"},params:{companyId:"c1"}};const res=responseRecorder();let next=false;await authorize("finance:read")(req,res,()=>{next=true});assert.equal(next,false);assert.equal(res.code,403);});

test("expense can be linked to a company BOQ item for commercial costing", async()=>{
  let payload;
  const supabase={from(table){
    if(table==="project_estimate_items")return {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{id:"boq-1",company_id:"c1",estimate:{project_id:"p1"}},error:null})};
    if(table==="expenses")return {insert(row){payload=row;return this;},select(){return this;},single:async()=>({data:{id:"e1",...payload},error:null})};
    throw new Error(`Unexpected table ${table}`);
  }};
  const service=new FinanceService({supabase});
  const out=await service.createExpense({companyId:"c1",userId:"u1",input:{category:"Materials",description:"Sand",amount:120000,expenseDate:"2026-10-01",estimateItemId:"boq-1"}});
  assert.equal(out.estimate_item_id,"boq-1");
  assert.equal(payload.project_id,"p1");
});

test("expense BOQ link rejects an item belonging to another selected project", async()=>{
  const supabase={from(table){
    if(table==="projects")return {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{id:"p2",company_id:"c1"},error:null})};
    if(table==="project_estimate_items")return {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{id:"boq-1",company_id:"c1",estimate:{project_id:"p1"}},error:null})};
    throw new Error(`Unexpected table ${table}`);
  }};
  const service=new FinanceService({supabase});
  await assert.rejects(service.createExpense({companyId:"c1",userId:"u1",input:{projectId:"p2",category:"Materials",description:"Sand",amount:120000,expenseDate:"2026-10-01",estimateItemId:"boq-1"}}),{code:"BOQ_PROJECT_MISMATCH"});
});

function expenseLinkSupabase({invoice={id:"inv-1",company_id:"c1",currency:"NGN",purchase_order_id:"po-1"},po={id:"po-1",company_id:"c1",project_id:"p1"},project={id:"p1",company_id:"c1"},onInsert=()=>{}}={}) {
  return {from(table){
    let filters={};
    const query={select(){return this;},eq(key,value){filters[key]=value;return this;},maybeSingle:async()=>{
      if(table==="projects")return {data:project&&filters.id===project.id&&filters.company_id===project.company_id?project:null,error:null};
      if(table==="supplier_invoices")return {data:invoice&&filters.id===invoice.id&&filters.company_id===invoice.company_id?invoice:null,error:null};
      if(table==="purchase_orders")return {data:po&&filters.id===po.id&&filters.company_id===po.company_id?po:null,error:null};
      throw new Error(`Unexpected maybeSingle table ${table}`);
    },insert(row){onInsert(row);this.row=row;return this;},single:async()=>({data:{id:"exp-1",...query.row},error:null})};
    if(table==="expenses")return query;
    return query;
  }};
}

test("supplier-invoice-linked expense inherits project from its company purchase order",async()=>{
  let inserted;
  const service=new FinanceService({supabase:expenseLinkSupabase({onInsert:row=>{inserted=row;}})});
  const out=await service.createExpense({companyId:"c1",userId:"u1",input:{category:"Materials",description:"Cement invoice",amount:55000,currency:"NGN",expenseDate:"2026-10-10",supplierInvoiceId:"inv-1"}});
  assert.equal(out.supplier_invoice_id,"inv-1");
  assert.equal(inserted.project_id,"p1");
});

test("supplier-invoice-linked expense rejects a currency mismatch before insert",async()=>{
  let inserted=false;
  const service=new FinanceService({supabase:expenseLinkSupabase({onInsert:()=>{inserted=true;}})});
  await assert.rejects(service.createExpense({companyId:"c1",userId:"u1",input:{category:"Materials",description:"Cement invoice",amount:55000,currency:"USD",expenseDate:"2026-10-10",supplierInvoiceId:"inv-1"}}),{code:"INVOICE_CURRENCY_MISMATCH"});
  assert.equal(inserted,false);
});

test("supplier-invoice-linked expense rejects a selected project different from its purchase order",async()=>{
  let inserted=false;
  const service=new FinanceService({supabase:expenseLinkSupabase({project:{id:"p2",company_id:"c1"},onInsert:()=>{inserted=true;}})});
  await assert.rejects(service.createExpense({companyId:"c1",userId:"u1",input:{projectId:"p2",category:"Materials",description:"Cement invoice",amount:55000,currency:"NGN",expenseDate:"2026-10-10",supplierInvoiceId:"inv-1"}}),{code:"INVOICE_PROJECT_MISMATCH"});
  assert.equal(inserted,false);
});

test("supplier invoice lookup is company-scoped and rejects an invoice from another company",async()=>{
  let inserted=false;
  const service=new FinanceService({supabase:expenseLinkSupabase({invoice:{id:"inv-1",company_id:"other-company",currency:"NGN",purchase_order_id:"po-1"},onInsert:()=>{inserted=true;}})});
  await assert.rejects(service.createExpense({companyId:"c1",userId:"u1",input:{category:"Materials",description:"Cement invoice",amount:55000,currency:"NGN",expenseDate:"2026-10-10",supplierInvoiceId:"inv-1"}}),{code:"SUPPLIER_INVOICE_NOT_FOUND"});
  assert.equal(inserted,false);
});
