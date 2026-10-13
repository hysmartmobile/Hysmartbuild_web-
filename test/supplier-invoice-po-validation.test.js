import test from 'node:test';
import assert from 'node:assert/strict';
import { ProcurementAccountingService } from '../src/services/procurementAccountingService.js';

function makeService({supplierId='supplier-a',poSupplierId='supplier-a',poCurrency='NGN',insertCalls={count:0}}={}) {
  const supabase={from(table){
    const query={table,filters:{},select(){return this;},eq(key,value){this.filters[key]=value;return this;},maybeSingle:async()=>{
      if(table==='suppliers')return {data:{id:'supplier-a',company_id:'company-a',status:'ACTIVE'},error:null};
      if(table==='purchase_orders')return {data:{id:'po-a',company_id:'company-a',supplier_id:poSupplierId,currency:poCurrency},error:null};
      return {data:null,error:null};
    },insert(row){insertCalls.count++;return {select(){return this;},single:async()=>({data:row,error:null})};}};
    return query;
  }};
  return new ProcurementAccountingService({supabase});
}

const input={supplierId:'supplier-a',purchaseOrderId:'po-a',invoiceNo:'INV-1',currency:'NGN',subtotal:100,tax:0,total:100};

test('supplier invoice cannot be linked to a purchase order owned by another supplier',async()=>{
  const insertCalls={count:0};
  const service=makeService({poSupplierId:'supplier-b',insertCalls});
  await assert.rejects(service.createSupplierInvoice({companyId:'company-a',userId:'user-a',input}),{code:'INVOICE_SUPPLIER_MISMATCH',status:409});
  assert.equal(insertCalls.count,0);
});

test('supplier invoice currency must match its linked purchase order currency',async()=>{
  const insertCalls={count:0};
  const service=makeService({poCurrency:'USD',insertCalls});
  await assert.rejects(service.createSupplierInvoice({companyId:'company-a',userId:'user-a',input}),{code:'CURRENCY_MISMATCH',status:409});
  assert.equal(insertCalls.count,0);
});

test('supplier invoice item endpoint refuses a second line batch for the same invoice',async()=>{
  let insertCalls=0;
  const supabase={from(table){const query={table,filters:{},select(){return this;},eq(key,value){this.filters[key]=value;return this;},in(){return this;},limit(){return this;},maybeSingle:async()=>({data:null,error:null}),insert(){insertCalls++;return this;},single:async()=>({data:null,error:null})};
    query.then=undefined;
    query.selectResult=()=>null;
    if(table==='supplier_invoices')query.maybeSingle=async()=>({data:{id:'inv-a',company_id:'company-a',supplier_id:'supplier-a',purchase_order_id:'po-a',currency:'NGN',subtotal:100,tax:0,total:100,status:'RECEIVED'},error:null});
    if(table==='purchase_orders')query.maybeSingle=async()=>({data:{id:'po-a',company_id:'company-a',supplier_id:'supplier-a',currency:'NGN'},error:null});
    if(table==='supplier_invoice_items'){
      query.limit=()=>({then:undefined, data:null});
      // Return a query object whose awaited value is the existing-line result.
      const base=query; query.eq=(key,value)=>{base.filters[key]=value;return base;};
      query.limit=()=>({then(resolve){resolve({data:[{id:'line-existing'}],error:null});}});
    }
    return query;
  }};
  const service=new ProcurementAccountingService({supabase});
  await assert.rejects(service.addSupplierInvoiceItems({companyId:'company-a',invoiceId:'inv-a',items:[{purchaseOrderItemId:'poi-a',quantity:1,unitPrice:100,taxRate:0}]}),{code:'INVOICE_LINES_ALREADY_EXIST',status:409});
  assert.equal(insertCalls,0);
});
