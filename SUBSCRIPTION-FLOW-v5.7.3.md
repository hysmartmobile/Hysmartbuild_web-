# v5.7.3 Subscription Lock UX

- All members of a company are routed to the subscription gate when the company subscription is missing, expired, cancelled, or suspended.
- Non-owner members can view a limited status and plan information but cannot start a trial or submit checkout. The page asks them to contact the company creator/owner.
- The locked app checks subscription status every 15 seconds; after the owner completes a verified renewal, the current member session returns to its role-based workspace automatically.
- The backend independently enforces owner-only billing changes and company-wide entitlement checks; UI controls are not the security boundary.
