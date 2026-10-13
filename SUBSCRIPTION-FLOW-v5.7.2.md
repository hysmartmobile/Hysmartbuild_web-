# HySmart Build Web v5.7.2 — subscription-first onboarding

- Company creation now routes to Billing & Subscription rather than the dashboard.
- Users can explicitly start a 14-day free trial or select a localized paid plan.
- Missing, expired, suspended, or cancelled subscriptions keep protected workspace routes locked.
- Successful trial activation reloads the app to re-check server subscription state.
- Successful payment verification redirects back to the workspace.

Deploy this web package together with backend v5.7.2 and apply the new Supabase migration first.
