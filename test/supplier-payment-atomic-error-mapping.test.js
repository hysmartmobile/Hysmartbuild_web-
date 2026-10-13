import test from 'node:test';
import assert from 'node:assert/strict';
import { mapSupplierPaymentAtomicError } from '../src/services/procurementAccountingService.js';

test('supplier payment overpayment race is returned as a stable conflict',()=>{
  const mapped=mapSupplierPaymentAtomicError({code:'P0001',message:'Payment exceeds outstanding supplier invoice balance',details:'internal detail'});
  assert.equal(mapped.code,'PAYMENT_OVER_LIMIT');
  assert.equal(mapped.status,409);
  assert.equal(mapped.message,'Payment exceeds the outstanding supplier invoice balance');
  assert.equal(mapped.message.includes('internal detail'),false);
});

test('supplier payment currency mismatch is a stable conflict',()=>{
  const mapped=mapSupplierPaymentAtomicError({code:'P0001',message:'Payment currency must match supplier invoice currency'});
  assert.equal(mapped.code,'PAYMENT_CURRENCY_MISMATCH');
  assert.equal(mapped.status,409);
});

test('unknown supplier payment database errors are not rewritten',()=>{
  const original={code:'XX000',message:'private database diagnostic'};
  assert.equal(mapSupplierPaymentAtomicError(original),original);
});
