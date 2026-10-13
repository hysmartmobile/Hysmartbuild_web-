const DAY_MS = 24 * 60 * 60 * 1000;

/** Calculate a user-facing countdown without changing server-authoritative access decisions. */
export function getSubscriptionTiming(subscription, effectiveStatus, now = Date.now()) {
  if (!subscription) {
    return { status: String(effectiveStatus || 'NONE').toUpperCase(), endAt: null, daysRemaining: null, expired: false, isTrial: false };
  }

  const status = String(effectiveStatus || subscription.status || 'NONE').toUpperCase();
  const recordedStatus = String(subscription.recordedStatus || subscription.status || status).toUpperCase();
  const isTrial = recordedStatus === 'TRIAL' || status === 'TRIAL';
  let endAt = null;

  if (status === 'GRACE_PERIOD' && subscription.grace_period_ends_at) {
    endAt = subscription.grace_period_ends_at;
  } else if (isTrial) {
    endAt = subscription.trial_ends_at || subscription.current_period_end || null;
  } else {
    endAt = subscription.current_period_end || null;
  }

  const timestamp = endAt ? Date.parse(endAt) : NaN;
  const validDate = Number.isFinite(timestamp);
  return {
    status,
    endAt: validDate ? new Date(timestamp).toISOString() : null,
    daysRemaining: validDate ? Math.max(0, Math.ceil((timestamp - now) / DAY_MS)) : null,
    expired: validDate && timestamp <= now,
    isTrial,
  };
}
