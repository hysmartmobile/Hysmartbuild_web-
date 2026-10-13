# HySmart Build v5.7.2 — explicit subscription choice

## Required deployment order

1. Back up the production database.
2. Apply `supabase/migrations/20261009150000_v5_7_2_explicit_subscription_choice.sql` to the same Supabase project used by the deployed API. It removes both legacy company-created trial triggers without deleting or changing existing subscription rows.
3. Deploy this backend package.
4. Deploy the matching web package and clear the frontend CDN cache if one is configured.
5. Verify the smoke checks below using a newly registered test account and a test company.

## Intended behavior

- Signup/login remains Supabase Auth-based.
- Company creation creates the company and owner membership but does not activate a subscription.
- The app redirects to Billing & Subscription after company creation.
- The owner explicitly starts a single 14-day Starter trial or starts paid checkout for an existing plan.
- Trial activation is owner-only, rejects companies that already have a subscription row, and is calculated server-side.
- Paid subscriptions are activated only after gateway verification/reconciliation.
- The web app fails closed and does not render protected workspace routes if subscription status is missing, expired, suspended, or cancelled.
- Backend authorization independently blocks protected company API access without a valid subscription. Billing routes remain accessible so owners can renew.

## Smoke checks

- Create a new company: confirm `company_subscriptions` has no row before plan selection.
- Visit `/billing`: confirm the 14-day free-trial action and localized paid plans appear.
- Start trial: confirm a `TRIAL` row with `trial_ends_at` 14 days from activation; protected dashboard routes then load.
- Test with an expired trial: protected API requests should return HTTP 402 `SUBSCRIPTION_REQUIRED`, while billing overview/checkout remain available.
- Complete test-mode paid checkout: confirm only verified payment changes the subscription to `ACTIVE` and routes back to the workspace.
- Attempt to start another trial for a company with an existing/expired subscription: confirm it is rejected.

## Notes

Existing trial and paid subscriptions are intentionally preserved by the migration. It only stops automatic trial provisioning for companies created after it is applied. The web build could not be run in this packaging environment because dependency installation did not complete; the subscription-specific Node tests and backend syntax checks are included in the release validation.
