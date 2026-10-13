# HySmart Build V4.1.0 — Strategic Construction Intelligence

This release completes the V3.8 → V4.1 strategic layer requested after the product review.

## V3.8 — Predictive Procurement & Material Risk
- Material need-date risk detection.
- Current inventory comparison.
- Purchase-order expected-delivery signals.
- Critical/high/medium material risk classification.
- Evidence-backed procurement recommendations.

## V3.9 — Contract & Claims Intelligence
- Site instruction entitlement signals.
- Overdue RFI / potential EOT signals.
- Change-order state visibility.
- Evidence chain including documents and approved progress.
- Advisory-only contractual intelligence; no automatic legal/contractual action.

## V4.0 — Construction Truth Engine
- Unified project truth across time, money, cash, execution, BOQ, procurement and contract.
- BOQ control chain.
- Schedule-delay consequence calculation.
- Estimated additional preliminaries where project daily-preliminary cost is configured.
- Truth confidence indicator.

## V4.1 — Explainable AI Construction Intelligence
- Explainable intervention recommendations.
- Evidence/source module references.
- Human-review-required guardrail.
- Deterministic fallback intelligence; no fabricated AI claims.
- Dedicated Construction Truth and project Intelligence experiences.

## Security
- Tenant-scoped queries.
- RLS for persisted intelligence events/benchmarks.
- Role-based intelligence permissions.
- No autonomous approval of money, contractual notices, safety decisions or claims.

## Verification
- Backend: 212/212 tests passing.
- Backend syntax checks passing for new services/routes.
- Web API JavaScript syntax check passing.
- Web production build could not be executed because Vite dependencies were not installed in the packaging environment; `npm ci` timed out. Production CI must run `npm ci && npm run build` before deployment.
