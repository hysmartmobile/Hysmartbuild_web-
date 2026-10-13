# HySmart Build Web v5.7.1 — Reliability & Flow Hardening

Production hardening on top of V5.7.0. Existing navigation, modules and construction workflows are preserved.

## Fixed
- Offline queued mutations are company-scoped and use explicit idempotent sync operations.
- Generic network-failed mutations are no longer replayed by the offline queue.
- Supported offline project/task/issue/report/attendance/material/material-request/inventory flows now use the sync contract.
- Legacy queued requests resolve their company from their stored path.
- PWA shell cache bumped to v5.7.1.
- Duplicate online synchronization listener removed.
