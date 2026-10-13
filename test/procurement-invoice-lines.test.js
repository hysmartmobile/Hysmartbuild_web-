import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page=fs.readFileSync(new URL('../src/pages/Procurement.jsx',import.meta.url),'utf8');
const api=fs.readFileSync(new URL('../src/lib/api.js',import.meta.url),'utf8');

test('procurement UI exposes supplier invoice item listing and creation actions',()=>{
  assert.ok(api.includes('supplierInvoiceItems:id=>call('));
  assert.ok(api.includes('createSupplierInvoiceItems:(id,p)=>call('));
  assert.match(page,/openInvoiceLines=async invoice=>/);
  assert.match(page,/Save invoice items/);
  assert.match(page,/Purchase-order item<select required/);
});

test('invoice-line UI checks entered lines against header subtotal, tax and total before submission',()=>{
  assert.match(page,/Invoice line subtotal, tax and total must match the invoice header/);
  assert.match(page,/invoiceLineTotal/);
  assert.match(page,/Invoice tax/);
});

test('invoice creation can link a purchase order and keeps invoice item entry locked after approval',()=>{
  assert.match(page,/purchaseOrderId:f\.purchaseOrderId\|\|undefined/);
  assert.match(page,/Invoice lines are locked after approval/);
  assert.match(page,/Saved invoice lines are read-only in this release/);
});
