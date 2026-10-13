import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, Clock3, CreditCard, X } from 'lucide-react';
import { getSubscriptionTiming } from '../lib/subscriptionTime';

const dateLabel = (value) => {
  if (!value) return 'date unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'date unavailable' : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

export default function SubscriptionStatusNotice({ subscription, companyId, canManageBilling = false }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(timer); }, []);
  const timing = useMemo(() => getSubscriptionTiming(subscription, undefined, now), [subscription, now]);
  const [showReminder, setShowReminder] = useState(false);
  const reminderKey = `hysmart-subscription-reminder:${companyId || 'company'}:${timing.endAt || 'unknown'}`;
  const eligibleForReminder = ['TRIAL', 'ACTIVE', 'PAST_DUE', 'GRACE_PERIOD'].includes(timing.status)
    && timing.daysRemaining !== null && timing.daysRemaining > 0 && timing.daysRemaining <= 3;

  useEffect(() => {
    if (!eligibleForReminder) {
      setShowReminder(false);
      return;
    }
    try {
      setShowReminder(window.localStorage.getItem(reminderKey) !== 'dismissed');
    } catch {
      setShowReminder(false);
    }
  }, [eligibleForReminder, reminderKey]);

  if (!subscription || timing.daysRemaining === null || timing.expired) return null;
  if (!['TRIAL', 'ACTIVE', 'PAST_DUE', 'GRACE_PERIOD'].includes(timing.status)) return null;

  const isTrial = timing.isTrial;
  const days = timing.daysRemaining;
  const dateText = dateLabel(timing.endAt);
  const headline = isTrial
    ? `Free trial: ${days} ${days === 1 ? 'day' : 'days'} remaining`
    : timing.status === 'PAST_DUE'
      ? `Payment needs attention · ${days} ${days === 1 ? 'day' : 'days'} remaining`
      : timing.status === 'GRACE_PERIOD'
        ? `Payment grace period: ${days} ${days === 1 ? 'day' : 'days'} remaining`
        : `Subscription: ${days} ${days === 1 ? 'day' : 'days'} remaining`;
  const detail = isTrial
    ? `Your free trial ends on ${dateText}. Choose a plan before then to avoid interruption.`
    : timing.status === 'PAST_DUE'
      ? `Your payment needs attention. The current period ends on ${dateText}; review billing to avoid interruption.`
      : timing.status === 'GRACE_PERIOD'
        ? `Your grace period ends on ${dateText}. Review billing to keep workspace access.`
        : subscription.cancel_at_period_end
          ? `Your subscription is scheduled to end on ${dateText}.`
          : `Your current subscription period ends on ${dateText}.`;

  const dismissReminder = () => {
    setShowReminder(false);
    try { window.localStorage.setItem(reminderKey, 'dismissed'); } catch { /* The banner still provides the reminder. */ }
  };

  return <>
    <section className={`subscription-countdown ${days <= 1 || timing.status === 'PAST_DUE' || timing.status === 'GRACE_PERIOD' ? 'subscription-countdown-warning' : ''}`} aria-label="Subscription status">
      <div className="subscription-countdown-icon">{isTrial ? <Clock3 size={20} /> : <CalendarClock size={20} />}</div>
      <div className="subscription-countdown-copy"><strong>{headline}</strong><span>{detail}</span></div>
      <Link className="btn primary subscription-countdown-action" to="/billing">{canManageBilling ? (isTrial ? 'Choose a plan' : 'Manage subscription') : 'View billing'}</Link>
    </section>
    {showReminder && <div className="subscription-reminder-backdrop">
      <section className="subscription-reminder-dialog" role="dialog" aria-modal="true" aria-labelledby="subscription-reminder-title">
        <button className="subscription-reminder-close" type="button" onClick={dismissReminder} aria-label="Dismiss reminder"><X size={18}/></button>
        <div className="subscription-reminder-icon">{isTrial ? <Clock3 size={25}/> : <CreditCard size={25}/>}</div>
        <p className="eyebrow">BILLING REMINDER</p>
        <h2 id="subscription-reminder-title">{isTrial ? 'Your free trial is nearly over' : 'Your subscription period is nearly over'}</h2>
        <p>{days === 1 ? 'There is 1 day remaining.' : `There are ${days} days remaining.`} {detail}</p>
        {!canManageBilling && <p className="subscription-reminder-owner-note">Only your company owner can upgrade or renew. Please contact them before the end date.</p>}
        <div className="subscription-reminder-actions"><button className="btn" type="button" onClick={dismissReminder}>Remind me later</button><Link className="btn primary" to="/billing" onClick={dismissReminder}>{canManageBilling ? 'Review billing options' : 'View subscription details'}</Link></div>
      </section>
    </div>}
  </>;
}
