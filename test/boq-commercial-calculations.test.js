import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateBoqCommercials } from '../src/services/boqCommercialCalculations.js';

const item = { line_total: 500, unit_rate: 50 };
const poLine = (overrides = {}) => ({
  line_total: 200,
  purchase_order_id: 'po-1',
  purchase_orders: { id: 'po-1', status: 'APPROVED', subtotal: 1000, total: 1100, currency: 'NGN' },
  ...overrides,
});

test('BOQ commercial calculation allocates a PO invoice by the BOQ line share, not by a currency amount', () => {
  const result = calculateBoqCommercials({
    item,
    completedQuantity: 4,
    certifiedValue: 150,
    poItems: [poLine()],
    supplierInvoices: [{ purchase_order_id: 'po-1', total: 550, currency: 'NGN', status: 'APPROVED' }],
    expenses: [{ amount: 10, status: 'PAID' }],
  });
  assert.equal(result.committedCost, 220);
  assert.equal(result.supplierInvoiceCost, 110);
  assert.equal(result.directExpenses, 10);
  assert.equal(result.allocatedActualCost, 120);
  assert.equal(result.remainingCommittedCost, 110);
  assert.equal(result.forecastCost, 230);
  assert.equal(result.forecastMargin, 270);
  assert.equal(result.marginPercentage, 54);
  assert.equal(result.earnedValue, 200);
  assert.equal(result.unbilledValue, 50);
});

test('BOQ calculation excludes draft and cancelled purchase orders and non-approved invoices', () => {
  const result = calculateBoqCommercials({
    item,
    poItems: [poLine(), poLine({ purchase_order_id: 'po-draft', purchase_orders: { id: 'po-draft', status: 'DRAFT', subtotal: 200, total: 200, currency: 'NGN' } })],
    supplierInvoices: [
      { purchase_order_id: 'po-1', total: 100, currency: 'NGN', status: 'RECEIVED' },
      { purchase_order_id: 'po-1', total: 50, currency: 'NGN', status: 'VOID' },
    ],
  });
  assert.equal(result.committedCost, 220);
  assert.equal(result.supplierInvoiceCost, 0);
  assert.equal(result.forecastCost, 220);
});

test('BOQ calculation excludes cross-currency invoice amounts and raises a reconciliation warning', () => {
  const result = calculateBoqCommercials({
    item,
    poItems: [poLine()],
    supplierInvoices: [{ purchase_order_id: 'po-1', total: 550, currency: 'USD', status: 'PAID' }],
  });
  assert.equal(result.supplierInvoiceCost, 0);
  assert.equal(result.reconciliation.currencyMismatchInvoiceCount, 1);
  assert.equal(result.reconciliation.requiresReview, true);
});

test('BOQ calculation handles zero budget and absent records without NaN or Infinity', () => {
  const result = calculateBoqCommercials({ item: { line_total: 0, unit_rate: 0 } });
  assert.equal(result.forecastMargin, 0);
  assert.equal(result.marginPercentage, null);
  for (const value of Object.values(result)) {
    if (typeof value === 'number') assert.ok(Number.isFinite(value));
  }
});

test('BOQ calculation excludes financial records in a different estimate currency', () => {
  const result = calculateBoqCommercials({
    item: { line_total: 500, unit_rate: 50, estimate: { currency: 'NGN' } },
    poItems: [poLine({ purchase_orders: { id: 'po-1', status: 'APPROVED', subtotal: 1000, total: 1100, currency: 'USD' } })],
    expenses: [{ id: 'exp-usd', amount: 90, currency: 'USD', status: 'APPROVED' }],
  });
  assert.equal(result.committedCost, 0);
  assert.equal(result.directExpenses, 0);
  assert.equal(result.reconciliation.requiresReview, true);
  assert.equal(result.reconciliation.baseCurrency, 'NGN');
});


test('BOQ forecast does not double-count an expense linked to an included supplier invoice', () => {
  const result = calculateBoqCommercials({
    item: { ...item, estimate: { currency: 'NGN' } },
    poItems: [poLine()],
    supplierInvoices: [{ id: 'inv-1', purchase_order_id: 'po-1', total: 550, currency: 'NGN', status: 'APPROVED' }],
    expenses: [
      { id: 'exp-linked', supplier_invoice_id: 'inv-1', amount: 110, currency: 'NGN', status: 'PAID' },
      { id: 'exp-other', amount: 25, currency: 'NGN', status: 'APPROVED' },
    ],
  });
  assert.equal(result.supplierInvoiceCost, 110);
  assert.equal(result.directExpenses, 25);
  assert.equal(result.allocatedActualCost, 135);
  assert.equal(result.reconciliation.duplicateExpenseCount, 1);
});

test('linked expense remains included if its supplier invoice is not included in the BOQ calculation', () => {
  const result = calculateBoqCommercials({
    item: { ...item, estimate: { currency: 'NGN' } },
    expenses: [{ id: 'exp-linked', supplier_invoice_id: 'inv-outside', amount: 75, currency: 'NGN', status: 'PAID' }],
  });
  assert.equal(result.directExpenses, 75);
  assert.equal(result.reconciliation.duplicateExpenseCount, 0);
});

test('BOQ duplicate-expense counter ignores draft or unpaid linked expenses', () => {
  const result = calculateBoqCommercials({
    item: { ...item, estimate: { currency: 'NGN' } },
    poItems: [poLine()],
    supplierInvoices: [{ id: 'inv-1', purchase_order_id: 'po-1', total: 550, currency: 'NGN', status: 'APPROVED' }],
    expenses: [
      { id: 'exp-draft', supplier_invoice_id: 'inv-1', amount: 110, currency: 'NGN', status: 'DRAFT' },
      { id: 'exp-pending', supplier_invoice_id: 'inv-1', amount: 110, currency: 'NGN', status: 'PENDING' },
    ],
  });
  assert.equal(result.directExpenses, 0);
  assert.equal(result.reconciliation.duplicateExpenseCount, 0);
});

test('BOQ reports currency inconsistency on a linked expense even when its invoice is counted once', () => {
  const result = calculateBoqCommercials({
    item: { ...item, estimate: { currency: 'NGN' } },
    poItems: [poLine()],
    supplierInvoices: [{ id: 'inv-1', purchase_order_id: 'po-1', total: 550, currency: 'NGN', status: 'APPROVED' }],
    expenses: [{ id: 'exp-linked', supplier_invoice_id: 'inv-1', amount: 110, currency: 'USD', status: 'PAID' }],
  });
  assert.equal(result.supplierInvoiceCost, 110);
  assert.equal(result.directExpenses, 0);
  assert.equal(result.reconciliation.duplicateExpenseCount, 1);
  assert.equal(result.reconciliation.currencyMismatchRecordCount, 1);
  assert.equal(result.reconciliation.requiresReview, true);
});

test('BOQ known-value reconciliation fixture matches commitments, invoiced cost, expenses, forecast and margin', () => {
  const result = calculateBoqCommercials({
    item: { line_total: 1000, unit_rate: 100, estimate: { currency: 'NGN' } },
    completedQuantity: 6,
    certifiedValue: 400,
    poItems: [{
      line_total: 300,
      purchase_order_id: 'po-known',
      purchase_orders: { id: 'po-known', status: 'APPROVED', subtotal: 600, total: 660, currency: 'NGN' },
    }],
    supplierInvoices: [{ id: 'inv-known', purchase_order_id: 'po-known', total: 330, currency: 'NGN', status: 'PARTIALLY_PAID' }],
    expenses: [
      { id: 'exp-invoice-mirror', supplier_invoice_id: 'inv-known', amount: 165, currency: 'NGN', status: 'PAID' },
      { id: 'exp-direct', amount: 40, currency: 'NGN', status: 'APPROVED' },
      { id: 'exp-pending', amount: 999, currency: 'NGN', status: 'PENDING' },
    ],
  });
  assert.deepEqual({
    budget: result.budget,
    earnedValue: result.earnedValue,
    certifiedValue: result.certifiedValue,
    unbilledValue: result.unbilledValue,
    committedCost: result.committedCost,
    supplierInvoiceCost: result.supplierInvoiceCost,
    directExpenses: result.directExpenses,
    allocatedActualCost: result.allocatedActualCost,
    remainingCommittedCost: result.remainingCommittedCost,
    forecastCost: result.forecastCost,
    forecastMargin: result.forecastMargin,
    marginPercentage: result.marginPercentage,
    duplicateExpenseCount: result.reconciliation.duplicateExpenseCount,
    requiresReview: result.reconciliation.requiresReview,
  }, {
    budget: 1000,
    earnedValue: 600,
    certifiedValue: 400,
    unbilledValue: 200,
    committedCost: 330,
    supplierInvoiceCost: 165,
    directExpenses: 40,
    allocatedActualCost: 205,
    remainingCommittedCost: 165,
    forecastCost: 370,
    forecastMargin: 630,
    marginPercentage: 63,
    duplicateExpenseCount: 1,
    requiresReview: false,
  });
});

test('BOQ known-value fixture flags linked invoice mirror currency mismatch without double-counting it', () => {
  const result = calculateBoqCommercials({
    item: { line_total: 1000, unit_rate: 100, estimate: { currency: 'NGN' } },
    poItems: [poLine()],
    supplierInvoices: [{ id: 'inv-mismatch', purchase_order_id: 'po-1', total: 550, currency: 'NGN', status: 'APPROVED' }],
    expenses: [{ id: 'exp-mismatch', supplier_invoice_id: 'inv-mismatch', amount: 110, currency: 'USD', status: 'PAID' }],
  });
  assert.equal(result.supplierInvoiceCost, 110);
  assert.equal(result.directExpenses, 0);
  assert.equal(result.allocatedActualCost, 110);
  assert.equal(result.reconciliation.duplicateExpenseCount, 1);
  assert.equal(result.reconciliation.currencyMismatchRecordCount, 1);
  assert.equal(result.reconciliation.requiresReview, true);
});


test('BOQ calculation counts a duplicate supplier invoice ID only once and flags reconciliation review', () => {
  const invoice = { id: 'inv-duplicate', purchase_order_id: 'po-1', total: 550, currency: 'NGN', status: 'APPROVED' };
  const result = calculateBoqCommercials({
    item: { ...item, estimate: { currency: 'NGN' } },
    poItems: [poLine()],
    supplierInvoices: [invoice, { ...invoice }],
  });
  assert.equal(result.supplierInvoiceCost, 110);
  assert.equal(result.allocatedActualCost, 110);
  assert.equal(result.reconciliation.duplicateSupplierInvoiceCount, 1);
  assert.equal(result.reconciliation.requiresReview, true);
});

test('BOQ calculation still counts distinct invoices against the same purchase order', () => {
  const result = calculateBoqCommercials({
    item: { ...item, estimate: { currency: 'NGN' } },
    poItems: [poLine()],
    supplierInvoices: [
      { id: 'inv-a', purchase_order_id: 'po-1', total: 200, currency: 'NGN', status: 'APPROVED' },
      { id: 'inv-b', purchase_order_id: 'po-1', total: 100, currency: 'NGN', status: 'PAID' },
    ],
  });
  assert.equal(result.supplierInvoiceCost, 60);
  assert.equal(result.reconciliation.duplicateSupplierInvoiceCount, 0);
  assert.equal(result.reconciliation.requiresReview, false);
});


test('BOQ calculation uses exact itemized invoice lines instead of proportional PO allocation', () => {
  const result = calculateBoqCommercials({
    item: { id: 'boq-a', line_total: 1000, unit_rate: 100, estimate: { currency: 'NGN' } },
    poItems: [poLine()],
    supplierInvoices: [{
      id: 'inv-itemized', purchase_order_id: 'po-1', total: 550, currency: 'NGN', status: 'APPROVED',
      items: [
        { total: 77, purchase_order_items: { estimate_item_id: 'boq-a' } },
        { total: 33, purchase_order_items: { estimate_item_id: 'boq-b' } },
      ],
    }],
  });
  assert.equal(result.supplierInvoiceCost, 77);
  assert.equal(result.allocatedActualCost, 77);
  assert.equal(result.reconciliation.requiresReview, false);
});

test('BOQ calculation does not fall back to PO-share allocation when itemized invoice lines map to another BOQ item', () => {
  const result = calculateBoqCommercials({
    item: { id: 'boq-a', line_total: 1000, unit_rate: 100, estimate: { currency: 'NGN' } },
    poItems: [poLine()],
    supplierInvoices: [{
      id: 'inv-itemized-other', purchase_order_id: 'po-1', total: 550, currency: 'NGN', status: 'APPROVED',
      items: [{ total: 110, purchase_order_items: { estimate_item_id: 'boq-b' } }],
    }],
  });
  assert.equal(result.supplierInvoiceCost, 0);
  assert.equal(result.reconciliation.requiresReview, false);
});
