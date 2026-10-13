const num = value => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const roundMoney = value => Math.round((num(value) + Number.EPSILON) * 100) / 100;
const ACTIVE_PO_STATUSES = new Set(['APPROVED', 'SENT', 'PARTIALLY_RECEIVED', 'RECEIVED']);
const INVOICE_COST_STATUSES = new Set(['APPROVED', 'PARTIALLY_PAID', 'PAID']);
const ACTIVE_SUBCONTRACT_STATUSES = new Set(['ACTIVE', 'SUSPENDED', 'COMPLETED']);

/**
 * Calculates item-level commercial indicators from the records already linked to a BOQ item.
 * Itemized supplier invoices are allocated by their exact PO-item-to-BOQ links. Legacy
 * header-only invoices are allocated by their share of the PO subtotal. Currency mismatches
 * are not silently converted: the invoice is excluded and reported for review.
 */
export function calculateBoqCommercials({ item, completedQuantity = 0, certifiedValue = 0, poItems = [], supplierInvoices = [], expenses = [], subcontractItems = [] }) {
  const baseCurrency = String(item?.estimate?.currency || '').toUpperCase();
  const currencyMismatchKeys = new Set();
  const budget = Math.max(0, num(item?.line_total));
  const earnedValue = Math.max(0, num(completedQuantity)) * Math.max(0, num(item?.unit_rate));
  const poCommitmentsById = new Map();
  const eligiblePoItems = [];

  for (const row of poItems) {
    const po = row?.purchase_orders;
    if (!po?.id || !ACTIVE_PO_STATUSES.has(String(po.status || '').toUpperCase())) continue;
    const poCurrency = String(po.currency || '').toUpperCase();
    if (baseCurrency && poCurrency && baseCurrency !== poCurrency) { currencyMismatchKeys.add(`po:${po.id}`); continue; }
    const lineAmount = Math.max(0, num(row.line_total));
    const poSubtotal = Math.max(0, num(po.subtotal));
    const poTotal = Math.max(0, num(po.total));
    const allocatedCommitment = poSubtotal > 0 ? lineAmount / poSubtotal * (poTotal || poSubtotal) : lineAmount;
    poCommitmentsById.set(po.id, (poCommitmentsById.get(po.id) || 0) + allocatedCommitment);
    eligiblePoItems.push({ ...row, _po: po, _lineShare: poSubtotal > 0 ? lineAmount / poSubtotal : 0, _allocatedCommitment: allocatedCommitment });
  }

  const sharesByPo = new Map();
  for (const row of eligiblePoItems) {
    sharesByPo.set(row._po.id, (sharesByPo.get(row._po.id) || 0) + row._lineShare);
  }

  let supplierActual = 0;
  const countedInvoiceIds = new Set();
  const countedInvoiceCurrencies = new Map();
  let duplicateSupplierInvoiceCount = 0;
  const poCurrencies = new Map(eligiblePoItems.map(row => [row._po.id, String(row._po.currency || '').toUpperCase()]));
  for (const invoice of supplierInvoices) {
    if (!INVOICE_COST_STATUSES.has(String(invoice.status || '').toUpperCase())) continue;
    const poId = invoice.purchase_order_id;
    if (!poId || !sharesByPo.has(poId)) continue;
    const poCurrency = poCurrencies.get(poId);
    const invoiceCurrency = String(invoice.currency || '').toUpperCase();
    if (poCurrency && invoiceCurrency && poCurrency !== invoiceCurrency) {
      currencyMismatchKeys.add(`invoice:${invoice.id || `${poId}:${invoice.total}:${invoice.status}`}`);
      continue;
    }
    if (baseCurrency && invoiceCurrency && baseCurrency !== invoiceCurrency) { currencyMismatchKeys.add(`invoice:${invoice.id || `${poId}:${invoice.total}:${invoice.status}`}`); continue; }
    // Defensive idempotency: duplicate rows from an upstream join/cache must not
    // inflate actual cost. Keep the first eligible record and require review.
    if (invoice.id && countedInvoiceIds.has(invoice.id)) { duplicateSupplierInvoiceCount += 1; continue; }
    if (invoice.id) {
      countedInvoiceIds.add(invoice.id);
      countedInvoiceCurrencies.set(invoice.id, invoiceCurrency);
    }
    // If itemized lines exist, allocate only lines mapped to this exact BOQ item.
    // Never fall back to proportional PO allocation for an itemized invoice: that
    // would reintroduce estimated allocation and can double-count line costs.
    if (Array.isArray(invoice.items) && invoice.items.length > 0) {
      const matchingLines = invoice.items.filter(line => line?.purchase_order_items?.estimate_item_id === item?.id);
      supplierActual += matchingLines.reduce((sum, line) => sum + Math.max(0, num(line.total)), 0);
      continue;
    }
    supplierActual += Math.max(0, num(invoice.total)) * Math.min(1, Math.max(0, sharesByPo.get(poId)));
  }

  let duplicateExpenseCount = 0;
  let directExpenses = 0;
  for (const row of expenses) {
    if (!['APPROVED', 'PAID'].includes(String(row.status || '').toUpperCase())) continue;
    const currency = String(row.currency || '').toUpperCase();
    const expenseKey = `expense:${row.id || `${row.amount}:${row.expense_date}`}`;
    const linkedInvoiceId = row.supplier_invoice_id;
    if (linkedInvoiceId && countedInvoiceIds.has(linkedInvoiceId)) {
      // The invoice is the financial source of truth when it is already included in
      // this BOQ calculation. Suppress its expense mirror, but surface inconsistent
      // currency metadata instead of silently hiding it. Draft/unpaid expense rows
      // are ignored above and must not inflate the duplicate counter.
      const invoiceCurrency = countedInvoiceCurrencies.get(linkedInvoiceId) || '';
      if ((baseCurrency && currency && currency !== baseCurrency) || (invoiceCurrency && currency && currency !== invoiceCurrency)) {
        currencyMismatchKeys.add(expenseKey);
      }
      duplicateExpenseCount += 1;
      continue;
    }
    if (baseCurrency && currency && currency !== baseCurrency) {
      currencyMismatchKeys.add(expenseKey);
      continue;
    }
    directExpenses += Math.max(0, num(row.amount));
  }
  directExpenses = roundMoney(directExpenses);
  const subcontractCommitment = subcontractItems
    .filter(row => {
      if (!ACTIVE_SUBCONTRACT_STATUSES.has(String(row.project_subcontracts?.status || '').toUpperCase())) return false;
      const currency = String(row.project_subcontracts?.currency || '').toUpperCase();
      if (baseCurrency && currency && currency !== baseCurrency) { currencyMismatchKeys.add(`subcontract:${row.subcontract_id || row.id}`); return false; }
      return true;
    })
    .reduce((sum, row) => sum + Math.max(0, num(row.amount)), 0);
  const poCommitment = [...poCommitmentsById.values()].reduce((sum, amount) => sum + amount, 0);
  const committedCost = poCommitment + subcontractCommitment;
  const actualCost = supplierActual + directExpenses;
  const remainingPoCommitment = Math.max(0, poCommitment - supplierActual);
  const forecastCost = actualCost + remainingPoCommitment + subcontractCommitment;
  const forecastMargin = budget - forecastCost;

  return {
    budget: roundMoney(budget),
    earnedValue: roundMoney(earnedValue),
    certifiedValue: roundMoney(certifiedValue),
    unbilledValue: roundMoney(Math.max(0, earnedValue - num(certifiedValue))),
    committedCost: roundMoney(committedCost),
    supplierInvoiceCost: roundMoney(supplierActual),
    directExpenses: roundMoney(directExpenses),
    allocatedActualCost: roundMoney(actualCost),
    remainingCommittedCost: roundMoney(remainingPoCommitment + subcontractCommitment),
    forecastCost: roundMoney(forecastCost),
    forecastMargin: roundMoney(forecastMargin),
    marginPercentage: budget > 0 ? roundMoney(forecastMargin / budget * 100) : null,
    reconciliation: {
      currencyMismatchInvoiceCount: [...currencyMismatchKeys].filter(key => key.startsWith('invoice:')).length,
      duplicateExpenseCount,
      duplicateSupplierInvoiceCount,
      currencyMismatchRecordCount: currencyMismatchKeys.size,
      baseCurrency: baseCurrency || null,
      requiresReview: currencyMismatchKeys.size > 0 || duplicateSupplierInvoiceCount > 0,
      basis: 'BOQ line budget less approved/paid recorded costs and remaining active commitments; supplier invoices allocated by BOQ-linked PO line share.',
    },
  };
}
