import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root=resolve(import.meta.dirname,'..','..');
const read=p=>readFileSync(resolve(root,p),'utf8');

test('daily report PDF export is permission-gated and includes site report fields',()=>{
  const page=read('HySmart-Build-Web/src/pages/Reports.jsx');
  assert.match(page,/report:export/);
  assert.match(page,/report:print/);
  assert.match(page,/printReportPdf\(/);
  assert.match(page,/work_completed/);
  assert.match(page,/safety_observations/);
});

test('accounting screen exposes account statement and print-to-PDF flow',()=>{
  const page=read('HySmart-Build-Web/src/pages/Accounting.jsx');
  assert.match(page,/Account Statement \/ Ledger/);
  assert.match(page,/Print \/ Save PDF/);
  assert.match(page,/reportType==='account-statement'/);
});

test('account statement is tenant-scoped, posted-only, and preserves opening balance',()=>{
  const service=read('HySmart-Build-Backend/src/services/procurementAccountingService.js');
  const branch=service.slice(service.indexOf("if(type==='account-statement')"),service.indexOf("if(type==='trial-balance'"));
  assert.match(branch,/assertAccount\(companyId,accountId\)/);
  assert.match(branch,/eq\('accounting_journals\.company_id',companyId\)/);
  assert.match(branch,/eq\('accounting_journals\.status','POSTED'\)/);
  assert.match(branch,/lt\('accounting_journals\.journal_date',fromDate\)/);
  assert.match(branch,/let running=opening/);
});

test('PDF print helper escapes report content and provides print/save workflow',()=>{
  const helper=read('HySmart-Build-Web/src/lib/printPdf.js');
  assert.match(helper,/escapeHtml/);
  assert.match(helper,/window\.print\(\)/);
  assert.match(helper,/Confidential — authorized company use only/);
});

test('print-only permission is distinct from broader report export and includes field leads',()=>{
  const rbac=read('HySmart-Build-Backend/src/rbac.js');
  const migration=read('HySmart-Build-Backend/supabase/migrations/20261009210000_v5_7_10_report_pdf_print_permission.sql');
  assert.match(rbac,/report:print/);
  assert.match(migration,/\('SITE_ENGINEER','report:print'\)/);
  assert.match(migration,/\('SITE_SUPERVISOR','report:print'\)/);
});

test('accounting PDF permission is restricted to finance leadership and accountants',()=>{
  const rbac=read('HySmart-Build-Backend/src/rbac.js');
  const migration=read('HySmart-Build-Backend/supabase/migrations/20261009211000_v5_7_10_accounting_pdf_permission.sql');
  const page=read('HySmart-Build-Web/src/pages/Accounting.jsx');
  assert.match(rbac,/accounting:print/);
  assert.match(migration,/\('ACCOUNTANT','accounting:print'\)/);
  assert.match(migration,/\('DIRECTOR','accounting:print'\)/);
  assert.match(page,/includes\('accounting:print'\)/);
});
