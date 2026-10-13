import { randomUUID } from "node:crypto";

const clean=v=>typeof v==='string'?v.trim():v;
const fail=(message,code='VALIDATION_ERROR',status=400)=>{const e=new Error(message);e.code=code;e.status=status;throw e;};

// PostgreSQL raises controlled P0001 errors for invariant violations in the
// atomic RPC. Translate only known messages to stable API errors; never relay
// arbitrary database messages to clients.
export function mapSupplierInvoiceAtomicError(error){
  const message=String(error?.message||'');
  const rules=[
    [/^Supplier invoice not found for this company$/, 'SUPPLIER_INVOICE_NOT_FOUND',404,'Supplier invoice was not found for this company'],
    [/^Purchase order not found for this company$/, 'PURCHASE_ORDER_NOT_FOUND',404,'Purchase order was not found for this company'],
    [/^Invoice lines already exist; duplicate submissions are blocked$/, 'INVOICE_LINES_ALREADY_EXIST',409,'Invoice lines already exist; duplicate submissions are blocked'],
    [/^Invoice must be linked to a purchase order before adding BOQ invoice lines$/, 'INVOICE_PURCHASE_ORDER_REQUIRED',409,'Link the invoice to a purchase order before adding invoice lines'],
    [/^Invoice lines can only be added before approval$/, 'INVOICE_LINES_LOCKED',409,'Invoice lines can only be added before approval'],
    [/^Invoice supplier does not match purchase order supplier$/, 'INVOICE_SUPPLIER_MISMATCH',409,'Invoice supplier must match the purchase order supplier'],
    [/^Invoice currency does not match purchase order currency$/, 'CURRENCY_MISMATCH',409,'Invoice currency must match the purchase order currency'],
    [/^Every invoice line must reference an item on the invoice purchase order$/, 'PO_ITEM_MISMATCH',409,'Every invoice line must reference an item on the invoice purchase order'],
    [/^Invoice line values failed server-side calculation validation$/, 'INVOICE_LINE_CALCULATION_MISMATCH',409,'Invoice line values failed server-side calculation validation'],
    [/^Invoice line quantity, price or tax rate is invalid$/, 'INVOICE_LINE_INVALID',400,'Invoice line quantity, price or tax rate is invalid'],
    [/^Invoice line totals must reconcile to the invoice header before saving$/, 'INVOICE_TOTAL_MISMATCH',409,'Invoice line totals must reconcile to the invoice header before saving'],
    [/^At least one supplier invoice line is required$/, 'INVOICE_LINES_REQUIRED',400,'At least one supplier invoice line is required']
  ];
  const match=rules.find(([pattern])=>pattern.test(message));
  if(!match)return error;
  const [,code,status,safeMessage]=match;
  return Object.assign(new Error(safeMessage),{code,status,cause:error});
}

export function mapSupplierPaymentAtomicError(error){
  const message=String(error?.message||'');
  const rules=[
    [/^Supplier invoice not found for this company$/, 'SUPPLIER_INVOICE_NOT_FOUND',404,'Supplier invoice was not found for this company'],
    [/^Supplier invoice must be approved before payment$/, 'INVOICE_NOT_PAYABLE',409,'Supplier invoice must be approved before payment'],
    [/^Payment amount must be greater than zero$/, 'PAYMENT_AMOUNT_INVALID',400,'Payment amount must be greater than zero'],
    [/^Payment exceeds outstanding supplier invoice balance$/, 'PAYMENT_OVER_LIMIT',409,'Payment exceeds the outstanding supplier invoice balance'],
    [/^Payment currency must match supplier invoice currency$/, 'PAYMENT_CURRENCY_MISMATCH',409,'Payment currency must match the supplier invoice currency']
  ];
  const match=rules.find(([pattern])=>pattern.test(message));
  if(!match)return error;
  const [,code,status,safeMessage]=match;
  return Object.assign(new Error(safeMessage),{code,status,cause:error});
}

export function mapReceivablePaymentAtomicError(error){
  const message=String(error?.message||'');
  const rules=[
    [/^Receivable invoice not found for this company$/, 'RECEIVABLE_INVOICE_NOT_FOUND',404,'Receivable invoice was not found for this company'],
    [/^Receivable invoice must be issued before payment$/, 'RECEIVABLE_INVOICE_NOT_PAYABLE',409,'Receivable invoice must be issued before payment'],
    [/^Payment amount must be greater than zero$/, 'PAYMENT_AMOUNT_INVALID',400,'Payment amount must be greater than zero'],
    [/^Payment exceeds receivable invoice balance$/, 'PAYMENT_OVER_LIMIT',409,'Payment exceeds the outstanding receivable balance'],
    [/^Payment currency must match receivable invoice currency$/, 'PAYMENT_CURRENCY_MISMATCH',409,'Payment currency must match the receivable invoice currency'],
    [/^Idempotency key was already used with a different payment payload$/, 'IDEMPOTENCY_KEY_CONFLICT',409,'This payment retry key was already used for a different payment'],
    [/^Payment idempotency key is too long$/, 'IDEMPOTENCY_KEY_INVALID',400,'Payment retry key is too long'],
    [/^Required receivables-payment accounting accounts are not configured$/, 'ACCOUNTING_ACCOUNTS_NOT_CONFIGURED',409,'Required receivables accounting accounts are not configured']
  ];
  const match=rules.find(([pattern])=>pattern.test(message));
  if(!match)return error;
  const [,code,status,safeMessage]=match;
  return Object.assign(new Error(safeMessage),{code,status,cause:error});
}

export class ProcurementAccountingService {
  constructor({supabase}){this.supabase=supabase;}
  async ensureAccounts(companyId){
    const {error}=await this.supabase.rpc('seed_default_chart_of_accounts',{p_company_id:companyId}); if(error) throw error;
  }
  async list(table,{companyId,page=1,pageSize=50,status,search,order='created_at',ascending=false}={}){
    const from=(page-1)*pageSize,to=from+pageSize-1; let q=this.supabase.from(table).select('*',{count:'exact'}).eq('company_id',companyId).order(order,{ascending}).range(from,to);
    if(status)q=q.eq('status',status); if(search){const cols={purchase_requisitions:'requisition_no,justification',purchase_quotations:'quotation_no,notes',purchase_orders:'po_no,notes',goods_received_notes:'grn_no,notes',supplier_invoices:'invoice_no,notes',supplier_payments:'payment_no,reference',accounts_receivable_invoices:'invoice_no,customer_name,customer_email',payroll_runs:'run_no,notes',accounting_journals:'journal_no,reference,description'}[table]; if(cols) q=q.or(cols.split(',').map(c=>`${c}.ilike.%${search}%`).join(','));}
    const {data,count,error}=await q;if(error)throw error;return {items:data??[],page,pageSize,total:count??0,totalPages:Math.ceil((count??0)/pageSize)};
  }
  async assertProject(companyId,id){if(!id)return;const {data,error}=await this.supabase.from('projects').select('id,company_id').eq('company_id',companyId).eq('id',id).maybeSingle();if(error)throw error;if(!data)fail('Project not found','PROJECT_NOT_FOUND',404);}
  async assertAccount(companyId,id){const {data,error}=await this.supabase.from('chart_of_accounts').select('id,company_id').eq('company_id',companyId).eq('id',id).maybeSingle();if(error)throw error;if(!data)fail('Account does not belong to this company','ACCOUNT_NOT_FOUND',404);return data;}
  async assertBankAccount(companyId,id){const {data,error}=await this.supabase.from('bank_accounts').select('id,company_id').eq('company_id',companyId).eq('id',id).maybeSingle();if(error)throw error;if(!data)fail('Bank account not found','BANK_ACCOUNT_NOT_FOUND',404);return data;}
  async assertSupplier(companyId,id){if(!id)return;const {data,error}=await this.supabase.from('suppliers').select('id,company_id,status').eq('company_id',companyId).eq('id',id).maybeSingle();if(error)throw error;if(!data)fail('Supplier not found','SUPPLIER_NOT_FOUND',404);if(data.status==='BLOCKED')fail('Supplier is blocked','SUPPLIER_BLOCKED',409);}
  async nextNo(table,prefix,companyId,col){const {count,error}=await this.supabase.from(table).select('id',{count:'exact',head:true}).eq('company_id',companyId);if(error)throw error;return `${prefix}-${String((count??0)+1).padStart(5,'0')}`;}

  async createRequisition({companyId,userId,input}){
    await this.assertProject(companyId,input.projectId);await this.assertSupplier(companyId,input.supplierId);
    const items=input.items??[];if(!items.length)fail('At least one requisition item is required');
    const no=input.requisitionNo||await this.nextNo('purchase_requisitions','PR',companyId,'requisition_no');let subtotal=0,tax=0;
    for(const i of items){subtotal+=Number(i.quantity)*Number(i.estimatedUnitPrice||0);tax+=subtotal*0;}
    const row={id:randomUUID(),company_id:companyId,requisition_no:no,project_id:input.projectId||null,site_id:input.siteId||null,requested_by:userId,supplier_id:input.supplierId||null,needed_by:input.neededBy||null,justification:clean(input.justification)||null,currency:input.currency||'NGN',status:'SUBMITTED',estimated_subtotal:subtotal,estimated_tax:tax,estimated_total:subtotal+tax};
    const {data,error}=await this.supabase.from('purchase_requisitions').insert(row).select().single();if(error)throw error;
    const rows=items.map(i=>({id:randomUUID(),requisition_id:data.id,material_id:i.materialId||null,description:clean(i.description),quantity:Number(i.quantity),unit:clean(i.unit),estimated_unit_price:Number(i.estimatedUnitPrice||0),tax_rate:Number(i.taxRate||0),cost_code_id:i.costCodeId||null}));
    const {error:ie}=await this.supabase.from('purchase_requisition_items').insert(rows);if(ie)throw ie;return this.getRequisition(companyId,data.id);
  }
  async getPO(companyId,id){const {data,error}=await this.supabase.from('purchase_orders').select('*,purchase_order_items(*)').eq('company_id',companyId).eq('id',id).single();if(error)throw error;return data;}
  async getRequisition(companyId,id){const {data,error}=await this.supabase.from('purchase_requisitions').select('*,purchase_requisition_items(*)').eq('company_id',companyId).eq('id',id).single();if(error)throw error;return data;}
  async decideRequisition({companyId,id,userId,decision,reason}){const action=decision==='APPROVED'?'APPROVE':'REJECT';const {data,error}=await this.supabase.rpc('perform_my_work_action',{p_company_id:companyId,p_user_id:userId,p_entity_type:'PROCUREMENT_REQUISITION',p_entity_id:id,p_action:action,p_reason:reason||null,p_payload:{}});if(error)throw error;return data?.item??data;}

  async createQuotation({companyId,userId,input}){await this.assertSupplier(companyId,input.supplierId);const items=input.items??[];if(!items.length)fail('At least one quotation item is required');const no=input.quotationNo||await this.nextNo('purchase_quotations','QT',companyId);const subtotal=items.reduce((s,i)=>s+Number(i.quantity)*Number(i.unitPrice),0);const tax=items.reduce((s,i)=>s+(Number(i.quantity||0)*Number(i.unitPrice||0)*Number(i.taxRate||0)/100),0);const row={id:randomUUID(),company_id:companyId,requisition_id:input.requisitionId,supplier_id:input.supplierId,quotation_no:no,quotation_date:input.quotationDate||new Date().toISOString().slice(0,10),valid_until:input.validUntil||null,currency:input.currency||'NGN',status:'SUBMITTED',subtotal,tax,total:subtotal+tax,notes:clean(input.notes)||null,created_by:userId};const {data,error}=await this.supabase.from('purchase_quotations').insert(row).select().single();if(error)throw error;const {error:ie}=await this.supabase.from('purchase_quotation_items').insert(items.map(i=>({id:randomUUID(),quotation_id:data.id,requisition_item_id:i.requisitionItemId||null,description:clean(i.description),quantity:Number(i.quantity),unit:clean(i.unit),unit_price:Number(i.unitPrice),tax_rate:Number(i.taxRate||0)})));if(ie)throw ie;return data;}
  async decideQuotation({companyId,id,userId,status,reason}){if(!['ACCEPTED','REJECTED','CANCELLED'].includes(status))fail('Invalid quotation decision');const action=status==='ACCEPTED'?'ACCEPT':status==='REJECTED'?'REJECT':'CANCEL';const {data,error}=await this.supabase.rpc('perform_my_work_action',{p_company_id:companyId,p_user_id:userId,p_entity_type:'PURCHASE_QUOTATION',p_entity_id:id,p_action:action,p_reason:reason||null,p_payload:{}});if(error)throw error;return data?.item??data;}

  async createPurchaseOrder({companyId,userId,input}){await this.assertSupplier(companyId,input.supplierId);await this.assertProject(companyId,input.projectId);const items=input.items??[];if(!items.length)fail('At least one purchase-order item is required');const no=input.poNo||await this.nextNo('purchase_orders','PO',companyId);const subtotal=items.reduce((s,i)=>s+Number(i.quantity)*Number(i.unitPrice),0);const tax=items.reduce((s,i)=>s+(Number(i.quantity||0)*Number(i.unitPrice||0)*Number(i.taxRate||0)/100),0);const {data,error}=await this.supabase.from('purchase_orders').insert({id:randomUUID(),company_id:companyId,po_no:no,supplier_id:input.supplierId,requisition_id:input.requisitionId||null,quotation_id:input.quotationId||null,project_id:input.projectId||null,site_id:input.siteId||null,order_date:input.orderDate||new Date().toISOString().slice(0,10),expected_date:input.expectedDate||null,currency:input.currency||'NGN',status:'SUBMITTED',subtotal,tax,total:subtotal+tax,notes:clean(input.notes)||null,created_by:userId}).select().single();if(error)throw error;const {error:ie}=await this.supabase.from('purchase_order_items').insert(items.map(i=>({id:randomUUID(),purchase_order_id:data.id,material_id:i.materialId||null,description:clean(i.description),quantity:Number(i.quantity),unit:clean(i.unit),unit_price:Number(i.unitPrice),tax_rate:Number(i.taxRate||0),cost_code_id:i.costCodeId||null,estimate_item_id:i.estimateItemId||null})));if(ie)throw ie;return data;}
  async decidePO({companyId,id,userId,status,reason}){if(!['APPROVED','SENT','CANCELLED'].includes(status))fail('Invalid purchase-order status');const action=status==='APPROVED'?'APPROVE':status==='SENT'?'SEND':'CANCEL';const {data,error}=await this.supabase.rpc('perform_my_work_action',{p_company_id:companyId,p_user_id:userId,p_entity_type:'PURCHASE_ORDER',p_entity_id:id,p_action:action,p_reason:reason||null,p_payload:{}});if(error)throw error;return data?.item??data;}

  async createGRN({companyId,userId,input}) {
    const {data,error}=await this.supabase.rpc("post_goods_received_note_atomic",{
      p_company_id:companyId,
      p_user_id:userId,
      p_purchase_order_id:input.purchaseOrderId,
      p_grn_no:input.grnNo||null,
      p_received_date:input.receivedDate||new Date().toISOString().slice(0,10),
      p_notes:clean(input.notes)||null,
      p_items:(input.items||[]).map(i=>({purchaseOrderItemId:i.purchaseOrderItemId,quantityReceived:Number(i.quantityReceived||0),quantityRejected:Number(i.quantityRejected||0),notes:clean(i.notes)||null}))
    });
    if(error)throw error;
    return data;
  }

  async createSupplierInvoice({companyId,userId,input}){
    await this.assertSupplier(companyId,input.supplierId);
    const no=input.invoiceNo;if(!no)fail('Supplier invoice number is required');
    const currency=String(input.currency||'NGN').toUpperCase();
    if(input.purchaseOrderId){
      const {data:po,error:poError}=await this.supabase.from('purchase_orders').select('id,company_id,supplier_id,currency').eq('company_id',companyId).eq('id',input.purchaseOrderId).maybeSingle();
      if(poError)throw poError;if(!po)fail('Purchase order not found for this company','PURCHASE_ORDER_NOT_FOUND',404);
      if(po.supplier_id!==input.supplierId)fail('Supplier invoice supplier must match the selected purchase order supplier','INVOICE_SUPPLIER_MISMATCH',409);
      if(String(po.currency||'').toUpperCase()!==currency)fail('Invoice and purchase order currencies must match','CURRENCY_MISMATCH',409);
    }
    const subtotal=Number(input.subtotal||0),tax=Number(input.tax||0),total=Number(input.total??subtotal+tax);
    const {data,error}=await this.supabase.from('supplier_invoices').insert({id:randomUUID(),company_id:companyId,supplier_id:input.supplierId,purchase_order_id:input.purchaseOrderId||null,grn_id:input.grnId||null,invoice_no:no,invoice_date:input.invoiceDate||new Date().toISOString().slice(0,10),due_date:input.dueDate||null,currency,status:'RECEIVED',subtotal,tax,total,notes:clean(input.notes)||null,created_by:userId}).select().single();if(error)throw error;return data;
  }
  async addSupplierInvoiceItems({companyId,invoiceId,items}){
    if(!Array.isArray(items)||!items.length)fail('At least one supplier invoice line is required');
    const {data:invoice,error:invoiceError}=await this.supabase.from('supplier_invoices').select('id,company_id,supplier_id,purchase_order_id,currency,subtotal,tax,total,status').eq('company_id',companyId).eq('id',invoiceId).maybeSingle();
    if(invoiceError)throw invoiceError;if(!invoice)fail('Supplier invoice not found for this company','SUPPLIER_INVOICE_NOT_FOUND',404);
    if(!invoice.purchase_order_id)fail('Invoice must be linked to a purchase order before adding BOQ invoice lines','INVOICE_PURCHASE_ORDER_REQUIRED',409);
    if(!['RECEIVED','DRAFT'].includes(String(invoice.status||'').toUpperCase()))fail('Invoice lines can only be added before approval','INVOICE_LINES_LOCKED',409);
    const {data:po,error:poError}=await this.supabase.from('purchase_orders').select('id,company_id,supplier_id,currency').eq('company_id',companyId).eq('id',invoice.purchase_order_id).maybeSingle();
    if(poError)throw poError;if(!po)fail('Purchase order not found for this company','PURCHASE_ORDER_NOT_FOUND',404);
    if(po.supplier_id!==invoice.supplier_id)fail('Supplier invoice supplier must match the purchase order supplier','INVOICE_SUPPLIER_MISMATCH',409);
    if(String(po.currency||'').toUpperCase()!==String(invoice.currency||'').toUpperCase())fail('Invoice and purchase order currencies must match','CURRENCY_MISMATCH',409);
    const {data:existingLines,error:existingLinesError}=await this.supabase.from('supplier_invoice_items').select('id').eq('company_id',companyId).eq('supplier_invoice_id',invoiceId).limit(1);
    if(existingLinesError)throw existingLinesError;if((existingLines||[]).length)fail('Invoice lines already exist; duplicate submissions are blocked','INVOICE_LINES_ALREADY_EXIST',409);
    const itemIds=[...new Set(items.map(x=>x.purchaseOrderItemId))];
    const {data:poItems,error:itemsError}=await this.supabase.from('purchase_order_items').select('id,purchase_order_id,description,unit,quantity,unit_price,estimate_item_id').eq('purchase_order_id',invoice.purchase_order_id).in('id',itemIds);
    if(itemsError)throw itemsError;if((poItems||[]).length!==itemIds.length)fail('Every invoice line must reference an item on the invoice purchase order','PO_ITEM_MISMATCH',409);
    const poItemMap=new Map((poItems||[]).map(x=>[x.id,x]));
    const rows=items.map((line)=>{
      const poItem=poItemMap.get(line.purchaseOrderItemId);const quantity=Number(line.quantity),unitPrice=Number(line.unitPrice),taxRate=Number(line.taxRate||0);
      if(!Number.isFinite(quantity)||quantity<=0||!Number.isFinite(unitPrice)||unitPrice<0||!Number.isFinite(taxRate)||taxRate<0)fail('Invoice line quantity, price or tax rate is invalid');
      const subtotal=Math.round((quantity*unitPrice+Number.EPSILON)*10000)/10000;const taxAmount=Math.round((subtotal*taxRate/100+Number.EPSILON)*10000)/10000;
      return {id:randomUUID(),company_id:companyId,supplier_invoice_id:invoiceId,purchase_order_id:invoice.purchase_order_id,purchase_order_item_id:poItem.id,description:clean(line.description)||poItem.description,quantity,unit:clean(line.unit)||poItem.unit,unit_price:unitPrice,tax_rate:taxRate,line_subtotal:subtotal,tax_amount:taxAmount,total:Math.round((subtotal+taxAmount+Number.EPSILON)*10000)/10000};
    });
    const subtotal=rows.reduce((sum,row)=>sum+row.line_subtotal,0),tax=rows.reduce((sum,row)=>sum+row.tax_amount,0),total=subtotal+tax;
    const tolerance=0.02;
    if(Math.abs(subtotal-Number(invoice.subtotal||0))>tolerance||Math.abs(tax-Number(invoice.tax||0))>tolerance||Math.abs(total-Number(invoice.total||0))>tolerance)fail('Invoice line totals must reconcile to the invoice header before saving','INVOICE_TOTAL_MISMATCH',409);
    // The database function locks the invoice header, repeats the critical
    // checks, and inserts the entire batch in one transaction. This closes the
    // race left by the service-level pre-check when two requests arrive together.
    const {data,error}=await this.supabase.rpc('add_supplier_invoice_items_atomic',{
      p_company_id:companyId,
      p_invoice_id:invoiceId,
      p_items:rows.map(row=>({
        id:row.id,
        purchase_order_item_id:row.purchase_order_item_id,
        description:row.description,
        quantity:row.quantity,
        unit:row.unit,
        unit_price:row.unit_price,
        tax_rate:row.tax_rate,
        line_subtotal:row.line_subtotal,
        tax_amount:row.tax_amount,
        total:row.total
      }))
    });
    if(error)throw mapSupplierInvoiceAtomicError(error);
    return Array.isArray(data)?data:[];
  }
  async listSupplierInvoiceItems({companyId,invoiceId}){const {data:invoice,error:invoiceError}=await this.supabase.from('supplier_invoices').select('id').eq('company_id',companyId).eq('id',invoiceId).maybeSingle();if(invoiceError)throw invoiceError;if(!invoice)fail('Supplier invoice not found for this company','SUPPLIER_INVOICE_NOT_FOUND',404);const {data,error}=await this.supabase.from('supplier_invoice_items').select('*,purchase_order_items!inner(estimate_item_id)').eq('company_id',companyId).eq('supplier_invoice_id',invoiceId);if(error)throw error;return data||[];}
  async approveSupplierInvoice({companyId,id,userId}){await this.ensureAccounts(companyId);const {data,error}=await this.supabase.rpc('perform_my_work_action',{p_company_id:companyId,p_user_id:userId,p_entity_type:'SUPPLIER_INVOICE',p_entity_id:id,p_action:'APPROVE',p_reason:null,p_payload:{}});if(error)throw error;return data?.item??data;}
  async createSupplierPayment({companyId,userId,input}){
    const amount=Number(input.amount);
    if(!Number.isFinite(amount)||amount<=0)fail('Payment amount must be greater than zero','PAYMENT_AMOUNT_INVALID',400);
    let currency=String(input.currency||'').trim().toUpperCase();
    if(!currency){
      const {data:invoiceCurrency,error:currencyError}=await this.supabase.from('supplier_invoices').select('currency').eq('company_id',companyId).eq('id',input.supplierInvoiceId).maybeSingle();
      if(currencyError)throw currencyError;
      currency=String(invoiceCurrency?.currency||'').trim().toUpperCase();
    }
    const no=input.paymentNo||await this.nextNo('supplier_payments','SP',companyId);
    const paymentId=randomUUID();
    await this.ensureAccounts(companyId);
    const {data,error}=await this.supabase.rpc('post_supplier_payment_atomic',{
      p_company_id:companyId,
      p_invoice_id:input.supplierInvoiceId,
      p_payment_id:paymentId,
      p_payment_no:no,
      p_payment_date:input.paymentDate||new Date().toISOString().slice(0,10),
      p_amount:amount,
      p_currency:currency,
      p_method:clean(input.method),
      p_reference:clean(input.reference)||null,
      p_notes:clean(input.notes)||null,
      p_created_by:userId
    });
    if(error)throw mapSupplierPaymentAtomicError(error);
    // Payment, invoice balance and its posted accounting journal are committed
    // together by the database function; there is no post-commit journal gap.
    return data;
  }

  async postJournal({companyId,userId,input}){await this.ensureAccounts(companyId);const lines=input.lines??[];if(lines.length<2)fail('A journal requires at least two lines');const no=input.journalNo||`JV-${randomUUID().replaceAll('-','').slice(0,20).toUpperCase()}`;const {data,error}=await this.supabase.rpc('post_accounting_journal_atomic',{p_company_id:companyId,p_journal_id:randomUUID(),p_journal_no:no,p_journal_date:input.journalDate||new Date().toISOString().slice(0,10),p_reference:clean(input.reference)||null,p_description:clean(input.description),p_source_type:input.sourceType||null,p_source_id:input.sourceId||null,p_created_by:userId,p_lines:lines.map(l=>({accountId:l.accountId,costCodeId:l.costCodeId||null,projectId:l.projectId||null,siteId:l.siteId||null,description:clean(l.description)||null,debit:Number(l.debit||0),credit:Number(l.credit||0),currency:l.currency||input.currency||'NGN'}))});if(error)throw error;return data;}
  async createAR({companyId,userId,input}){await this.ensureAccounts(companyId);const subtotal=Number(input.subtotal||0),tax=Number(input.tax||0),total=Number(input.total??subtotal+tax);if(!Number.isFinite(subtotal)||!Number.isFinite(tax)||!Number.isFinite(total)||subtotal<0||tax<0||total<=0||Math.round((subtotal+tax)*10000)!==Math.round(total*10000))fail('Receivable invoice totals are invalid','AR_TOTAL_MISMATCH',400);const no=input.invoiceNo||`AR-${randomUUID().replaceAll('-','').slice(0,20).toUpperCase()}`;const {data,error}=await this.supabase.rpc('create_receivable_invoice_atomic',{p_company_id:companyId,p_invoice_id:randomUUID(),p_invoice_no:no,p_customer_name:clean(input.customerName),p_customer_email:clean(input.customerEmail)||null,p_project_id:input.projectId||null,p_invoice_date:input.invoiceDate||new Date().toISOString().slice(0,10),p_due_date:input.dueDate||null,p_currency:input.currency||'NGN',p_subtotal:subtotal,p_tax:tax,p_total:total,p_notes:clean(input.notes)||null,p_created_by:userId});if(error)throw error;return data;}
  async payAR({companyId,userId,input}){
    const amount=Number(input.amount);
    if(!Number.isFinite(amount)||amount<=0)fail('Payment amount must be greater than zero','PAYMENT_AMOUNT_INVALID',400);
    const no=input.paymentNo||await this.nextNo('accounts_receivable_payments','RP',companyId);
    const currency=String(input.currency||'').trim().toUpperCase();
    const {data:invoice,error:invoiceError}=await this.supabase.from('accounts_receivable_invoices').select('currency').eq('company_id',companyId).eq('id',input.invoiceId).maybeSingle();
    if(invoiceError)throw invoiceError;
    if(!invoice)fail('Receivable invoice not found','RECEIVABLE_INVOICE_NOT_FOUND',404);
    await this.ensureAccounts(companyId);
    const {data,error}=await this.supabase.rpc('post_receivable_payment_atomic',{
      p_company_id:companyId,p_invoice_id:input.invoiceId,p_payment_id:randomUUID(),p_payment_no:no,
      p_payment_date:input.paymentDate||new Date().toISOString().slice(0,10),p_amount:amount,
      p_currency:currency||String(invoice.currency||'').toUpperCase(),p_method:clean(input.method),
      p_reference:clean(input.reference)||null,p_created_by:userId,
      p_idempotency_key:clean(input.idempotencyKey)||null
    });
    if(error)throw mapReceivablePaymentAtomicError(error);
    return data;
  }
  async listAccounts(companyId){await this.ensureAccounts(companyId);const {data,error}=await this.supabase.from('chart_of_accounts').select('*').eq('company_id',companyId).order('code');if(error)throw error;return data??[];}
  async listCostCodes(companyId){await this.ensureAccounts(companyId);const {data,error}=await this.supabase.from('cost_codes').select('*').eq('company_id',companyId).order('code');if(error)throw error;return data??[];}
  async createAccount({companyId,input}){if(input.parentId)await this.assertAccount(companyId,input.parentId);const {data,error}=await this.supabase.from('chart_of_accounts').insert({id:randomUUID(),company_id:companyId,code:clean(input.code),name:clean(input.name),account_type:input.accountType,parent_id:input.parentId||null,system_account:false}).select().single();if(error)throw error;return data;}
  async createCostCode({companyId,input}){const {data,error}=await this.supabase.from('cost_codes').insert({id:randomUUID(),company_id:companyId,code:clean(input.code),name:clean(input.name),category:clean(input.category)||null}).select().single();if(error)throw error;return data;}
  async createTaxRate({companyId,input}){const {data,error}=await this.supabase.from('tax_rates').insert({id:randomUUID(),company_id:companyId,code:clean(input.code),name:clean(input.name),rate:Number(input.rate),country_code:input.countryCode||null}).select().single();if(error)throw error;return data;}
  async createPayroll({companyId,userId,input}){const items=input.items??[];const no=input.runNo||`PAY-${randomUUID().replaceAll('-','').slice(0,20).toUpperCase()}`;const {data,error}=await this.supabase.rpc('create_payroll_run_atomic',{p_company_id:companyId,p_run_id:randomUUID(),p_run_no:no,p_period_start:input.periodStart,p_period_end:input.periodEnd,p_pay_date:input.payDate||null,p_notes:clean(input.notes)||null,p_created_by:userId,p_items:items.map(i=>({workerId:i.workerId||null,workerName:clean(i.workerName),grossAmount:Number(i.grossAmount||0),taxAmount:Number(i.taxAmount||0),deductions:Number(i.deductions||0),currency:i.currency||'NGN'}))});if(error)throw error;return data;}
  async approvePayroll({companyId,id,userId,status}){if(!['APPROVED','PAID','VOID'].includes(status))fail('Invalid payroll status');const {data,error}=await this.supabase.rpc('perform_my_work_action',{p_company_id:companyId,p_user_id:userId,p_entity_type:'PAYROLL_RUN',p_entity_id:id,p_action:status==='APPROVED'?'APPROVE':status,p_reason:null,p_payload:{}});if(error)throw error;return data?.item??data;}
  async createBankAccount({companyId,userId,input}){const {data,error}=await this.supabase.from('bank_accounts').insert({id:randomUUID(),company_id:companyId,name:clean(input.name),bank_name:clean(input.bankName)||null,account_number_masked:clean(input.accountNumberMasked)||null,currency:input.currency||'NGN',opening_balance:Number(input.openingBalance||0),created_by:userId}).select().single();if(error)throw error;return data;}
  async createBankTx({companyId,userId,input}){const amount=Number(input.amount);if(!Number.isFinite(amount)||amount===0)fail('Bank transaction amount must be non-zero','BANK_TRANSACTION_AMOUNT_INVALID',400);const {data,error}=await this.supabase.rpc('create_bank_transaction_atomic',{p_company_id:companyId,p_transaction_id:randomUUID(),p_bank_account_id:input.bankAccountId,p_transaction_date:input.transactionDate,p_reference:clean(input.reference)||null,p_description:clean(input.description),p_amount:Math.abs(amount),p_transaction_type:input.transactionType,p_source_type:input.sourceType||null,p_source_id:input.sourceId||null,p_created_by:userId});if(error)throw error;return data;}
  async reconcileBankTx({companyId,id}){const {data,error}=await this.supabase.rpc('reconcile_bank_transaction_atomic',{p_company_id:companyId,p_transaction_id:id});if(error)throw error;return data;}

  async report(companyId,type,{fromDate,toDate,accountId}={}){await this.ensureAccounts(companyId);if(type==='account-statement'){if(!accountId)fail('Select an account to generate its statement','ACCOUNT_REQUIRED',400);await this.assertAccount(companyId,accountId);const select='id,debit,credit,currency,description,accounting_journals!inner(id,company_id,status,journal_date,journal_no,reference,description),chart_of_accounts!inner(id,code,name,account_type)';const base=()=>this.supabase.from('accounting_journal_lines').select(select).eq('accounting_journals.company_id',companyId).eq('accounting_journals.status','POSTED').eq('account_id',accountId);let opening=0;if(fromDate){const {data:prior,error:priorError}=await base().lt('accounting_journals.journal_date',fromDate);if(priorError)throw priorError;for(const l of prior||[]){const debit=Number(l.debit||0),credit=Number(l.credit||0);opening+=['LIABILITY','EQUITY','REVENUE'].includes(l.chart_of_accounts.account_type)?credit-debit:debit-credit;}}let q=base().order('journal_date',{foreignTable:'accounting_journals',ascending:true});if(fromDate)q=q.gte('accounting_journals.journal_date',fromDate);if(toDate)q=q.lte('accounting_journals.journal_date',toDate);const {data,error}=await q;if(error)throw error;let running=opening;return (data||[]).map(l=>{const debit=Number(l.debit||0),credit=Number(l.credit||0);running+=['LIABILITY','EQUITY','REVENUE'].includes(l.chart_of_accounts.account_type)?credit-debit:debit-credit;return {date:l.accounting_journals.journal_date,journalNo:l.accounting_journals.journal_no,reference:l.accounting_journals.reference,description:l.description||l.accounting_journals.description||'',debit,credit,balance:running,currency:l.currency||'NGN',accountCode:l.chart_of_accounts.code,accountName:l.chart_of_accounts.name};});}if(type==='trial-balance'||type==='profit-loss'||type==='balance-sheet'){let q=this.supabase.from('accounting_journal_lines').select('account_id,debit,credit,currency,accounting_journals!inner(company_id,status,journal_date),chart_of_accounts!inner(code,name,account_type)').eq('accounting_journals.company_id',companyId).eq('accounting_journals.status','POSTED');if(fromDate)q=q.gte('accounting_journals.journal_date',fromDate);if(toDate)q=q.lte('accounting_journals.journal_date',toDate);const {data,error}=await q;if(error)throw error;const m=new Map();for(const l of data??[]){const a=l.chart_of_accounts;const x=m.get(a.code)||{code:a.code,name:a.name,accountType:a.account_type,debit:0,credit:0,balance:0};x.debit+=Number(l.debit);x.credit+=Number(l.credit);x.balance=x.debit-x.credit;m.set(a.code,x);}const rows=[...m.values()].map(x=>({...x,balance:x.accountType==='REVENUE'?x.credit-x.debit:x.debit-x.credit}));if(type==='profit-loss')return rows.filter(x=>['REVENUE','EXPENSE'].includes(x.accountType));if(type==='balance-sheet')return rows.filter(x=>['ASSET','LIABILITY','EQUITY'].includes(x.accountType));return rows;}if(type==='ap-aging'){const {data,error}=await this.supabase.from('supplier_invoices').select('id,invoice_no,supplier_id,invoice_date,due_date,total,amount_paid,currency,status,suppliers(name)').eq('company_id',companyId).in('status',['APPROVED','PARTIALLY_PAID','RECEIVED']);if(error)throw error;return (data??[]).map(x=>({...x,outstanding:Number(x.total)-Number(x.amount_paid),daysPastDue:x.due_date?Math.max(0,Math.floor((Date.now()-new Date(x.due_date).getTime())/86400000)):0}));}if(type==='ar-aging'){const {data,error}=await this.supabase.from('accounts_receivable_invoices').select('*').eq('company_id',companyId).in('status',['ISSUED','PARTIALLY_PAID']);if(error)throw error;return (data??[]).map(x=>({...x,outstanding:Number(x.total)-Number(x.amount_paid),daysPastDue:x.due_date?Math.max(0,Math.floor((Date.now()-new Date(x.due_date).getTime())/86400000)):0}));}if(type==='cash-flow'){const {data,error}=await this.supabase.from('bank_transactions').select('*').eq('company_id',companyId).order('transaction_date',{ascending:true});if(error)throw error;return data??[];}if(type==='project-costs'){const {data,error}=await this.supabase.from('accounting_journal_lines').select('project_id,debit,credit,currency,accounting_journals!inner(company_id,status),chart_of_accounts!inner(account_type)').eq('accounting_journals.company_id',companyId).eq('accounting_journals.status','POSTED').not('project_id','is',null);if(error)throw error;const m={};for(const l of data??[]){const k=l.project_id;m[k]=(m[k]||0)+Number(l.debit)-Number(l.credit);}return Object.entries(m).map(([projectId,cost])=>({projectId,cost}));}return [];
  }
  async postSupplierInvoiceJournal(companyId,userId,inv){const accounts=await this.listAccounts(companyId);const debit=accounts.find(a=>a.code==='5000'),credit=accounts.find(a=>a.code==='2000');if(!debit||!credit)return;await this.postJournal({companyId,userId,input:{description:`Supplier invoice ${inv.invoice_no}`,sourceType:'SUPPLIER_INVOICE',sourceId:inv.id,currency:inv.currency,lines:[{accountId:debit.id,debit:Number(inv.total),credit:0,currency:inv.currency},{accountId:credit.id,debit:0,credit:Number(inv.total),currency:inv.currency}]}});}
  async postSupplierPaymentJournal(companyId,userId,payment,inv){const accounts=await this.listAccounts(companyId);const debit=accounts.find(a=>a.code==='2000'),credit=accounts.find(a=>a.code==='1000');if(!debit||!credit)return;await this.postJournal({companyId,userId,input:{description:`Supplier payment ${payment.payment_no}`,sourceType:'SUPPLIER_PAYMENT',sourceId:payment.id,currency:payment.currency,lines:[{accountId:debit.id,debit:Number(payment.amount),credit:0,currency:payment.currency},{accountId:credit.id,debit:0,credit:Number(payment.amount),currency:payment.currency}]}});}
  async postARInvoiceJournal(companyId,userId,inv){const accounts=await this.listAccounts(companyId);const debit=accounts.find(a=>a.code==='1100'),credit=accounts.find(a=>a.code==='4000');if(!debit||!credit)return;await this.postJournal({companyId,userId,input:{description:`AR invoice ${inv.invoice_no}`,sourceType:'AR_INVOICE',sourceId:inv.id,currency:inv.currency,lines:[{accountId:debit.id,debit:Number(inv.total),credit:0,currency:inv.currency},{accountId:credit.id,debit:0,credit:Number(inv.total),currency:inv.currency}]}});}
  async postARPaymentJournal(companyId,userId,payment,inv){const accounts=await this.listAccounts(companyId);const debit=accounts.find(a=>a.code==='1000'),credit=accounts.find(a=>a.code==='1100');if(!debit||!credit)return;await this.postJournal({companyId,userId,input:{description:`Customer payment ${payment.payment_no}`,sourceType:'AR_PAYMENT',sourceId:payment.id,currency:payment.currency,lines:[{accountId:debit.id,debit:Number(payment.amount),credit:0,currency:payment.currency},{accountId:credit.id,debit:0,credit:Number(payment.amount),currency:payment.currency}]}});}
}
