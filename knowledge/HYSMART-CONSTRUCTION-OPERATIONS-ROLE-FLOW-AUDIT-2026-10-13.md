# HySmart Build — Construction Operations, Role and Workflow Audit

**Audit date:** 13 October 2026  
**Source:** HySmart Build Web + Backend snapshot containing the My Work / role workflow implementation.  
**Method:** static source and migration review, focused Node tests, syntax checks. No production Supabase credentials or deployed database were available, so this is not a live penetration test or company acceptance sign-off.

## Executive result

The app has the right foundation for a connected construction operating system: project-scoped records, a role/permission system, collaboration records, procurement and finance modules, a personal My Work panel, and workflow history. It is not safe to describe the entire platform as fully verified or leakage-free until the migration is applied to staging and each role is tested against real company/project data.

This review found concrete gaps and applied code changes in the working copy:

1. Added a new database hardening migration that makes the public-schema data plane backend-only for browser roles (the browser uses Supabase Auth and signed Storage URLs), and removes direct client insert/update/delete access to workflow audit events.
2. Replaced the broken legacy expense approval/payment RPC definitions in the new migration. The previous approval function contained references to variables that do not exist in that function. The payment function also rejected the backend service-role call path because it required `auth.uid()` to be present even though the API calls it through the service-role client.
3. Added RFI assignment/response notifications and site-instruction issue/acknowledgement notifications so those field/office hand-offs do not rely only on someone opening a module.
4. Expanded the Team role dropdown to include the operational and specialist roles supported by the backend.
5. Added API-side invitation role hierarchy checks so a Company Admin or Director cannot invite an executive/admin-level role just by editing the request payload.
6. Added focused regression tests for the above.

## Construction workflow routing standard

| Origin / activity | Responsible first channel | What moves forward | Next responsible channel | Required close-out |
|---|---|---|---|---|
| Worker observes a defect, hazard or obstruction | Site task / issue / safety channel | Description, location, severity, photos/evidence, time and reporter | Site Supervisor → Site Engineer / HSE / Project Manager according to type | Owner, due date, corrective action, verification and closure evidence |
| Site Supervisor daily attendance, production and workfront status | Site operations / daily report | Labour, equipment, quantities, progress, blockers, safety/quality observations | Site Engineer → Project Manager | Review decision, correction reason if rejected, accepted daily record |
| Site Engineer needs design clarification | RFI / technical collaboration | Numbered question, drawing/specification reference, evidence, required-by date | Assigned Civil/Design Engineer or named technical reviewer; escalates to PM if overdue | Written response, responder, timestamp, affected drawing/workfront and originator notification |
| Engineer issues an instruction to the field | Site instruction | Explicit instruction, scope/location, priority, responsible person and due date | Assigned Site Engineer / Supervisor | Recipient acknowledgement, execution evidence, verification and closure |
| Drawing, material submittal or method statement | Submittal / document control | Revision, discipline, reviewer, due date and supporting documents | Named technical reviewer → PM / client only where contract requires | Approve / approve with comments / reject or resubmit, reason, revision history and notification |
| Site requests materials | Material request → procurement | Specification, quantity, required date, project/cost code, justification | Storekeeper availability check → Procurement Officer → delegated approver | Approved quantity/budget, supplier/order, delivery, GRN, store receipt and site issue |
| Purchase requisition / quotation / PO | Procurement | Vendor comparisons, scope, terms, budget/cost code and attachments | Procurement Officer → authorized budget/PO approver → supplier | Approval trail, sent PO, delivery/GRN, invoice match and exception handling |
| Supplier invoice / expense / payment | Finance and accounts payable | Invoice/receipt, PO/GRN match, tax, cost code, approval and payment evidence | Accountant → separate authorized approver → payment officer | No self-approval, duplicate/invoice checks, balanced posting, reference, reconciliation and submitter notification |
| Payroll / worker administration | HR + payroll | Approved attendance, rate, deductions, exception list and period | HR Manager → authorized payroll approver → separate payment/reconciliation role | Confidential access, review, approval, payment journal and restricted history |
| Cost, variation, valuation or claim | QS / Commercial | Measurement, BOQ/cost code, change evidence, contract clause, forecast impact | QS → Commercial Manager → Project Manager / management approval by threshold | Approved variation, budget impact, client submission, decision and forecast update |
| Project risks, delayed decisions, budget and programme exceptions | Project Manager / controls | Exception, owner, due date, cost/time/safety consequence and mitigation | Management only for thresholds, overdue escalation or reserved decisions | Named decision, authority, rationale, owner, deadline and tracked follow-through |
| Client submission / decision | Client-facing collaboration | Only contractually shared records and decisions requested | Named client reviewer → PM / document control | Decision, comments, timestamps and controlled distribution back to the site |

**Rule:** the person who creates an item should not approve their own item when segregation of duties applies. A role having read access does not imply permission to act. A company-wide manager view must not be used to bypass project, record-type, or financial permissions.

## Role-by-role operating expectations

| Role | Primary workbench and inbound queue | Expected outbound hand-off | Boundary that must be enforced |
|---|---|---|---|
| Super Admin | Platform health, support and authorized incident work | Scoped support findings to the relevant company owner | No broad tenant-data browsing by default; support access must be justified and audited |
| Company Owner | Company portfolio, financial risk, billing, workforce/access, reserved approvals and escalations | Delegations, approvals, resource decisions and policy direction | Billing/ownership controls remain distinct from ordinary Company Admin actions |
| Company Admin | Memberships, invitations, access lifecycle, workspace settings and operational setup | Correct role/project access and administrative notices | Must not grant owner/super-admin roles; must not gain financial approval solely from admin status |
| CEO | Portfolio performance, high-impact risk, major cost/time decisions and escalations | Strategic decision or delegation to Director/Management/PM | Summary visibility is not blanket permission to change every record |
| Director | Cross-project delivery, overdue approvals, commercial and safety escalations | Delegated decisions and recovery actions to PM/functional leads | Project/financial actions remain permission- and threshold-controlled |
| Management | Assigned executive/operational decisions, cross-functional blockers and approved reports | Decision, priority, budget/resource direction and escalation response | Define the company-specific remit; avoid treating “Management” as an unrestricted super-role |
| Project Manager | Project plan, daily reports, RFIs, submittals, tasks/issues, procurement needs, change and risks | Work packages and instructions to engineers/supervisors; approvals/escalations to management | Access restricted to assigned projects unless separately authorized |
| Site Engineer | Drawings, technical queries, inspections, daily progress, measurements and site instructions | Technical clarifications to design/reviewer; verified progress/issues to PM | Cannot self-approve own reports/submittals; must work from controlled current revisions |
| Civil Engineer | Design/technical review queue, RFIs, drawing revisions, technical submittals | Written technical response or approved revision to PM/site engineer | Review authority should be explicit; never silently overwrite a controlled drawing revision |
| Site Supervisor | Daily labour/equipment/production, safety/quality observations, field task assignments | Verified daily records, hazards, blockers and completed work to Site Engineer/PM | No access to payroll details or company financial data beyond operational need |
| Worker | Assigned tasks, site instructions, safety notices and own submitted issues | Acknowledgement, progress/evidence, issue/hazard report to Supervisor | No unrelated projects, other workers’ private records, procurement pricing or company finance |
| Accountant | Expenses, supplier invoices, payment status, bank/reconciliation and finance reports | Exceptions and payment batches to authorized approver; reconciled result to management | Separate prepare/approve/pay/post permissions; no self-approval or duplicate posting |
| Commercial Manager | Contract, variations, claims, valuations, notices, commitments and margin risks | Commercial recommendation and approval pack to PM/management/client as authorized | Contract-sensitive data and approval limits must be permission/threshold controlled |
| Quantity Surveyor | BOQ, measurements, valuations, cost codes, variations and forecast | Quantified change/valuation to Commercial Manager/PM | Record evidence and revisions; no unilateral budget or contract approval unless granted |
| Procurement Officer | Requisitions, supplier quotations, purchase orders, delivery and invoice matching | Competitive quote/PO pack to authorized approver; delivery exceptions to PM/store | Supplier creation and PO approval must be separate where possible; no self-approval |
| Storekeeper | Stock balances, receipts, material requests, issues/returns and low-stock alerts | Stock/GRN/issue confirmation to procurement, accountant and requesting site | Quantities and movements must be traceable; no ability to approve own purchase spend |
| HR Manager | Worker records, attendance exceptions, leave and payroll inputs | Approved HR inputs/exceptions to payroll/management | Sensitive employee data restricted to HR/payroll-authorized roles |
| Client | Explicitly shared project documents, submittals, decisions and client requests | Contractual comments/approvals to named PM/document controller | Must not see internal cost, payroll, unrelated projects, internal issue discussion or private records |
| Procurement/Finance/HR specialists | Their assigned functional queue and relevant project-linked records | Exceptions and approvals to their authorized next step | No implicit access across other functions merely because they work in the same company |

## Source findings still requiring attention or staging verification

- **Returned-for-correction is not a universal state.** Some workflows have `REJECTED` and submittals have `RESUBMIT`, but the same consistent return/resubmit lifecycle is not proven across reports, expenses, requisitions, invoices and tasks. Do not label a rejected item “returned” unless the underlying workflow supports it.
- **The My Work panel is a common queue, not proof that every module is end-to-end complete.** Some actions still open their owning module, and not every record type supports direct action from the panel.
- **Decision traceability varies by record.** The common panel needs consistent display of decision actor/time, reason, next owner and the next due date, with project activity/audit history as the canonical record.
- **Payroll segregation of duties needs live verification.** Confirm the person approving a payroll run cannot also execute payment where company policy requires separation; verify role permissions and journal posting in the database.
- **RLS/tenant isolation must be tested using actual authenticated roles.** Backend queries use explicit `company_id` and project filtering, but a service-role backend bypasses RLS and therefore depends on correct filters and authorization middleware. The new migration revokes direct table grants from browser roles; verify signed Storage uploads/downloads and all API-driven screens after applying it.
- **Invitation hierarchy is now enforced at the route in this working copy.** Confirm the deployed role matrix and any other member-role change endpoints follow the same rule.
- **No real database migration was applied in this audit.** Apply the new migration to an isolated staging database, then run the database smoke tests and end-to-end acceptance checklist below before production.

## Release acceptance checklist

### Access and tenant isolation
- [ ] For each of the 18 company roles, verify only its approved navigation, data fields and actions appear.
- [ ] Attempt cross-company reads/actions with a valid user from a different company; expect `403`/not-found without disclosing the record.
- [ ] Attempt cross-project reads/actions for an unassigned engineer, worker and client; confirm no data leakage.
- [ ] Suspend a member and verify all protected API actions fail immediately, including stale sessions.
- [ ] Switch company in two browser tabs and verify old company data never renders after the switch.
- [ ] Try direct API calls bypassing hidden buttons, including audit table insert/update/delete and role escalation via invitations.

### Workflow correctness
- [ ] Submit a daily report as Site Engineer; it appears in Sent by Me and only the permitted project reviewer sees it in Awaiting My Review.
- [ ] Reject/return with a reason; the originator gets a notification and sees status, reason, actor and timestamp.
- [ ] Submit an RFI; the named reviewer receives it. Respond; the originator receives the response notification.
- [ ] Issue a site instruction; the assigned site user receives it. Acknowledge; the issuer receives the acknowledgement.
- [ ] Create a material request; verify store availability → procurement → approver → delivery/GRN → store issue → site receipt linkage.
- [ ] Verify PO, supplier invoice, payment, ledger journal and bank reconciliation are consistent and idempotent.
- [ ] Verify the creator cannot approve their own submission; test the payroll approver/payer separation policy.
- [ ] Verify a decision updates the source record, audit event, notification, personal queue and management summary without duplicates.

### Operational reliability
- [ ] Apply all migrations on staging and run the staging smoke script.
- [ ] Run all frontend tests and production build.
- [ ] Run the complete backend test suite and investigate every failure (the previous audit snapshot had unresolved failures; targeted tests are not a substitute).
- [ ] Test network loss, retry, double-clicks, stale tabs, duplicate submissions and concurrent approval attempts.
- [ ] Test project handover, role change, subscription expiry and restore/recovery.

## Test status for this working copy

- Focused My Work + atomic financial workflow tests: **16 passed** after the hardening changes.
- Backend JavaScript syntax checks for touched service/route files: passed.
- Full dependency install timed out in this environment; full backend suite, frontend production build, live Supabase migration and real-user role acceptance remain **unverified**.

**Release decision:** improved and ready for isolated staging verification; **not yet certified production-safe** until the checklist above passes against the deployed schema and actual role accounts.
