import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const page = readFileSync(resolve('src/pages/Expenses.jsx'), 'utf8');

test('expense form exposes optional project, BOQ and supplier invoice links', () => {
  assert.match(page, /Project \(optional\)/);
  assert.match(page, /BOQ item \(optional\)/);
  assert.match(page, /Supplier invoice link \(optional\)/);
  assert.match(page, /estimateItemId:f\.estimateItemId\|\|undefined/);
  assert.match(page, /supplierInvoiceId:f\.supplierInvoiceId\|\|undefined/);
});

test('expense page reloads linked data and displays saved source links', () => {
  assert.match(page, /api\.projects\(\{pageSize:100\}\)/);
  assert.match(page, /api\.supplierInvoices\(\{pageSize:100\}\)/);
  assert.match(page, /api\.boqIntelligence\(projectId\)/);
  assert.match(page, /x\.supplier_invoice_id/);
  assert.match(page, /x\.estimate_item_id/);
});

test('expense form documents duplicate-link semantics to avoid accidental double counting', () => {
  assert.match(page, /Link an expense to an invoice only when this expense represents that same invoice/);
  assert.match(page, /Linked duplicates are excluded from the BOQ direct-expense total/);
});
