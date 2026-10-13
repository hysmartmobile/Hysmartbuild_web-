import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, '../src/services/operatingSystemService.js'), 'utf8');

test('BOQ item service loads PO totals/currency and invoice currency needed for traceable allocation', () => {
  assert.match(source, /purchase_orders!inner\(id,po_no,project_id,status,order_date,expected_date,currency,subtotal,total,supplier_id,suppliers\(name\)\)/);
  assert.match(source, /supplier_invoices'\)\.select\('id,purchase_order_id,total,currency,status'\)/);
  assert.match(source, /calculateBoqCommercials\(\{item,completedQuantity:done,certifiedValue:certified,poItems:poItems\.data\|\|\[\],supplierInvoices,expenses:expenses\.data\|\|\[\],subcontractItems:subItems\.data\|\|\[\]\}\)/);
});


test('BOQ item service fetches the supplier-invoice link for duplicate-cost reconciliation', () => {
  assert.match(source, /expenses'\)\.select\('id,description,category,amount,currency,expense_date,status,vendor_name,supplier_invoice_id'\)/);
});

test('supplier-invoice expense link migration is tenant-scoped and additive', () => {
  const migration = fs.readFileSync(path.join(here, '../supabase/migrations/20261010100000_v1_10_expense_supplier_invoice_link.sql'), 'utf8');
  assert.match(migration, /add column if not exists supplier_invoice_id uuid/i);
  assert.match(migration, /foreign key \(company_id, supplier_invoice_id\)/i);
  assert.match(migration, /references public\.supplier_invoices\(company_id, id\)/i);
  assert.match(migration, /on delete restrict/i);
});

test('supplier invoice line migration is additive, company-scoped and protects PO linkage', () => {
  const migration = fs.readFileSync(path.join(here, '../supabase/migrations/20261010120000_v1_11_supplier_invoice_items.sql'), 'utf8');
  assert.match(migration, /create table if not exists public\.supplier_invoice_items/i);
  assert.match(migration, /foreign key \(company_id, supplier_invoice_id\)/i);
  assert.match(migration, /foreign key \(company_id, purchase_order_id\)/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /validate_supplier_invoice_item_links/i);
  assert.match(migration, /must match the invoice purchase order/i);
});

test('supplier invoice line API requires procurement permissions and validates bounded line inputs', () => {
  const route = fs.readFileSync(path.join(here, '../src/routes/procurementAccounting.js'), 'utf8');
  assert.match(route, /supplier-invoices\/:id\/items',authorize\('procurement:read'\)/);
  assert.match(route, /supplier-invoices\/:id\/items',authorize\('procurement:create'\)/);
  assert.match(route, /max\(200\)/);
  assert.match(route, /purchaseOrderItemId:z\.string\(\)\.uuid\(\)/);
});

test('supplier invoice line service validates company, PO ownership, currency and header totals', () => {
  const service = fs.readFileSync(path.join(here, '../src/services/procurementAccountingService.js'), 'utf8');
  assert.match(service, /addSupplierInvoiceItems/);
  assert.match(service, /\.eq\('company_id',companyId\)\.eq\('id',invoiceId\)/);
  assert.match(service, /CURRENCY_MISMATCH/);
  assert.match(service, /PO_ITEM_MISMATCH/);
  assert.match(service, /INVOICE_TOTAL_MISMATCH/);
  assert.match(service, /rpc\('add_supplier_invoice_items_atomic'/);
});

test('BOQ service loads invoice item lines and maps each line to its linked BOQ item', () => {
  assert.match(source, /from\('supplier_invoice_items'\)\.select\('id,supplier_invoice_id,total,purchase_order_items!inner\(estimate_item_id\)'\)/);
  assert.match(source, /items:byInvoice\.get\(inv\.id\)\|\|\[\]/);
});

test('supplier invoice item workflow validates supplier match and prevents duplicate line submissions',()=>{
  const service=fs.readFileSync(new URL('../src/services/procurementAccountingService.js',import.meta.url),'utf8');
  assert.match(service,/INVOICE_SUPPLIER_MISMATCH/);
  assert.match(service,/INVOICE_LINES_ALREADY_EXIST/);
  assert.match(service,/supplier_invoice_items/);
});
