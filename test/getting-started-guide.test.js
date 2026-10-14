import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('guided onboarding is registered in the existing app and workspace navigation', () => {
  const app = read('../src/App.jsx');
  const layout = read('../src/components/Layout.jsx');
  assert.ok(app.includes("import GettingStarted from'./pages/GettingStarted';"));
  assert.ok(app.includes('path="getting-started" element={<GettingStarted/>}'));
  assert.ok(layout.includes("['/getting-started','Getting Started',ClipboardCheck,'project:read']"));
  assert.ok(layout.includes('subscription}}/>'));
});

test('guided onboarding uses existing project, budget, procurement, expense and report APIs', () => {
  const page = read('../src/pages/GettingStarted.jsx');
  for (const api of ['api.projects(', 'api.projectBudgetLines(', 'api.purchaseOrders(', 'api.expenses(', 'api.reports(']) assert.ok(page.includes(api), `missing ${api}`);
});

test('sample project is local-only, labelled as fictional, and never written to backend', () => {
  const page = read('../src/pages/GettingStarted.jsx');
  assert.match(page, /Deliberately local-only sample data/);
  assert.match(page, /No project, budget, purchase order, report or expense is created, edited or sent to the backend/);
  assert.match(page, /Illustrative construction project · not company data/);
  assert.doesNotMatch(page, /localStorage|sessionStorage/);
});

test('checklist distinguishes completed, pending and permission-blocked steps with navigation links', () => {
  const page = read('../src/pages/GettingStarted.jsx');
  assert.match(page, /const status = step\.done \? 'complete' : step\.blocked \? 'blocked' : 'pending'/);
  assert.match(page, /Blocked — permission required/);
  assert.match(page, /<Link to=/);
  assert.match(page, /Ask your company administrator to grant the required role permission/);
});

test('value demonstration uses recorded counts and totals without asserting savings', () => {
  const page = read('../src/pages/GettingStarted.jsx');
  assert.match(page, /const expenseTotal = sumField\(currentEvidence\.expenses, 'amount', \['REJECTED', 'CANCELLED'\]\)/);
  assert.match(page, /const procurementTotal = sumField\(currentEvidence\.purchaseOrders, 'total', \['CANCELLED'\]\)/);
  assert.match(page, /No invented savings/);
  assert.match(page, /not a forecast, approved cost variance or proof of savings/);
});

test('trial progress is based on the subscription trial end date and does not guess when unavailable', () => {
  const page = read('../src/pages/GettingStarted.jsx');
  assert.match(page, /subscription\?\.trial_ends_at/);
  assert.match(page, /Trial day/);
  assert.match(page, /Trial timing could not be verified/);
  assert.match(page, /Open billing/);
});
