# HySmart Build v5.7.3 — Company-wide subscription enforcement

## Behavior
- Subscription entitlement is checked server-side against the selected company for protected API routes. All active company members are blocked when that company's trial or subscription expires.
- Billing status remains readable to active members through a minimal endpoint; detailed billing history remains limited to roles with billing-read permission.
- Only the active `COMPANY_OWNER` can start a trial, initiate checkout, verify a payment, cancel, or resume a subscription.
- After payment verification updates the company subscription to a valid status, all members recover access automatically (the web app polls while locked) and retain their existing roles and permissions.
- Memberships, roles, and project/business records are not deleted or rewritten by the subscription gate.

## Deploy
1. Deploy the backend package. No additional database migration is required for this patch; it builds on the v5.7.2 subscription schema.
2. Deploy the web package.
3. Test with at least an owner and a non-owner member: expire the trial, verify both are blocked from workspace routes, renew as owner, then verify both regain access and each role's original navigation/permissions remain intact.
