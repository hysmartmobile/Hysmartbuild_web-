# RC55 — BOQ-to-profitability acceptance plan and source-contract coverage

## Workflow under test
BOQ item/budget → approved purchase order commitment → supplier invoice item mapped to PO/BOQ item → posted goods received note → inventory receipt → site issue/field consumption → measured progress/earned value → actual cost and forecast margin reconciliation.

## Automated checks available in this release
- Known-value BOQ fixtures exercise commitments, invoiced costs, expenses, forecast and margin.
- Itemized supplier invoice costs map to BOQ items instead of falling back to proportional PO allocation when mappings exist.
- GRN function locks the PO and PO lines, checks ordered/received quantities and calls the inventory transaction function.
- Inventory transaction logic locks balances, blocks negative stock and records immutable movements.
- Linked expenses and invoice records have duplicate-cost and currency mismatch checks.

## Important limitation
The RC55 tests are source-contract and deterministic calculation tests, not a live PostgreSQL end-to-end test. They do not create a complete seeded company/project/BOQ/PO/GRN/stock issue/progress dataset in a running database. Before pilot, execute the full scenario in staging, force a failure mid-transaction to verify rollback, then assert: PO received quantity; GRN lines; inventory balance and transaction history; field ISSUE quantities; BOQ actual cost; forecast cost; gross margin; and no duplicate ledger/expense inclusion. Include a deliberate failure midway and verify the entire transaction rolls back.
