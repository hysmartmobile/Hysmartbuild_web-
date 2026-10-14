import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getSubscriptionTiming } from '../src/lib/subscriptionTime.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(testDir, '../src');
const DAY = 24 * 60 * 60 * 1000;
const now = Date.parse('2026-10-13T12:00:00.000Z');

test('trial countdown uses the trial end date and rounds partial days up', () => {
  const result = getSubscriptionTiming({ status: 'TRIAL', trial_ends_at: new Date(now + 2 * DAY + 1).toISOString() }, 'TRIAL', now);
  assert.equal(result.isTrial, true);
  assert.equal(result.daysRemaining, 3);
  assert.equal(result.expired, false);
});

test('paid subscription countdown prefers current period end over an old trial end', () => {
  const result = getSubscriptionTiming({ status: 'ACTIVE', trial_ends_at: new Date(now - 20 * DAY).toISOString(), current_period_end: new Date(now + 8 * DAY).toISOString() }, 'ACTIVE', now);
  assert.equal(result.isTrial, false);
  assert.equal(result.daysRemaining, 8);
});

test('grace period countdown uses grace period end date', () => {
  const result = getSubscriptionTiming({ status: 'ACTIVE', current_period_end: new Date(now - DAY).toISOString(), grace_period_ends_at: new Date(now + 2 * DAY).toISOString() }, 'GRACE_PERIOD', now);
  assert.equal(result.daysRemaining, 2);
  assert.equal(result.expired, false);
});

test('expired subscriptions never show negative days remaining', () => {
  const result = getSubscriptionTiming({ status: 'TRIAL', trial_ends_at: new Date(now - DAY).toISOString() }, 'EXPIRED', now);
  assert.equal(result.daysRemaining, 0);
  assert.equal(result.expired, true);
});

test('workspace layout shows countdown and reminder actions, and app expiry gate offers billing', () => {
  const layout = readFileSync(path.join(srcDir, 'components/Layout.jsx'), 'utf8');
  const notice = readFileSync(path.join(srcDir, 'components/SubscriptionStatusNotice.jsx'), 'utf8');
  const app = readFileSync(path.join(srcDir, 'App.jsx'), 'utf8');
  const billing = readFileSync(path.join(srcDir, 'pages/Billing.jsx'), 'utf8');
  assert.ok(layout.includes('<SubscriptionStatusNotice'));
  assert.ok(notice.includes('subscription-reminder-dialog'));
  assert.ok(notice.includes('Remind me later'));
  assert.ok(notice.includes('to="/billing"'));
  assert.ok(app.includes('role="dialog" aria-modal="true"'));
  assert.ok(app.includes('Upgrade or renew subscription'));
  assert.ok(billing.includes('billing-expired-notice'));
  assert.ok(billing.includes('remainingLabel'));
});
