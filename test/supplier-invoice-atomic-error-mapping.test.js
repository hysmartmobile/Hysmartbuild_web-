import test from 'node:test';
import assert from 'node:assert/strict';
import { mapSupplierInvoiceAtomicError } from '../src/services/procurementAccountingService.js';

test('atomic invoice duplicate race becomes a stable HTTP 409 conflict',()=>{
  const mapped=mapSupplierInvoiceAtomicError({code:'P0001',message:'Invoice lines already exist; duplicate submissions are blocked',details:'internal db detail'});
  assert.equal(mapped.code,'INVOICE_LINES_ALREADY_EXIST');
  assert.equal(mapped.status,409);
  assert.equal(mapped.message,'Invoice lines already exist; duplicate submissions are blocked');
  assert.equal(mapped.message.includes('internal db detail'),false);
});

test('atomic invoice reconciliation failures become a stable HTTP 409 conflict',()=>{
  const mapped=mapSupplierInvoiceAtomicError({code:'P0001',message:'Invoice line totals must reconcile to the invoice header before saving'});
  assert.equal(mapped.code,'INVOICE_TOTAL_MISMATCH');
  assert.equal(mapped.status,409);
});

test('atomic invoice missing-record failures become 404 responses',()=>{
  const mapped=mapSupplierInvoiceAtomicError({code:'P0001',message:'Supplier invoice not found for this company'});
  assert.equal(mapped.code,'SUPPLIER_INVOICE_NOT_FOUND');
  assert.equal(mapped.status,404);
});

test('unknown database errors are not rewritten or exposed by the mapper',()=>{
  const original={code:'XX000',message:'sensitive internal diagnostic'};
  assert.equal(mapSupplierInvoiceAtomicError(original),original);
});
