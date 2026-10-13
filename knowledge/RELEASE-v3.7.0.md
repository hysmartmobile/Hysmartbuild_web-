# HySmart Build V3.7.0 — Construction Operating System

## Purpose
Turn the existing modules into one daily operating system focused on decisions, accountability, field usability and institutional memory.

## Included
- Role-driven HySmart Today command centre.
- Executive, finance and field/site operating views.
- Automatic cross-module alerts for project, cash, material, action, RFI, quality and safety risks.
- Money-at-risk and revenue/margin signals.
- BOQ Control chain linking estimate items to schedule, progress, materials, labour and certification.
- Company memory using operational/audit history.
- Historical company productivity and margin benchmarks.
- 14-day operating adoption/progress view.
- Browser voice capture for daily reports.
- Field-message intake classified into material, schedule, safety, quality and commercial signals; ready to sit behind a WhatsApp provider.
- Project-scoped supplier exposure correction carried forward from V3.5.
- 205 backend tests passing.

## Verification
Backend syntax checks and full automated backend test suite pass. Web production build was not verified because dependency installation timed out in the packaging environment; CI must run `npm ci && npm run build`.
