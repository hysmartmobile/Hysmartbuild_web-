#!/usr/bin/env bash
set -euo pipefail

# Safe rehearsal only: custom-format pg_dump backup -> EMPTY isolated test database.
# This script intentionally refuses production-like database names and never uses --clean.
: "${BACKUP_FILE:?Set BACKUP_FILE to the custom-format database backup file}"
: "${RESTORE_TARGET_DATABASE_URL:?Set RESTORE_TARGET_DATABASE_URL to the isolated restore-test database}"
: "${RESTORE_TARGET_DATABASE_NAME:?Set RESTORE_TARGET_DATABASE_NAME to the exact target database name}"
: "${RESTORE_REHEARSAL_ACK:?Set RESTORE_REHEARSAL_ACK=RESTORE_TO_EMPTY_ISOLATED_DATABASE after checking the target}"

if [[ "$RESTORE_REHEARSAL_ACK" != "RESTORE_TO_EMPTY_ISOLATED_DATABASE" ]]; then
  echo "FAIL: explicit isolated-database acknowledgement is required." >&2; exit 2
fi
if [[ ! "$RESTORE_TARGET_DATABASE_NAME" =~ (restore[_-]?test|staging[_-]?restore) ]]; then
  echo "FAIL: target database name must contain restore_test or staging_restore." >&2; exit 2
fi
if [[ ! -f "$BACKUP_FILE" || ! -s "$BACKUP_FILE" ]]; then
  echo "FAIL: backup file is missing or empty." >&2; exit 2
fi
command -v pg_restore >/dev/null || { echo "FAIL: pg_restore is required." >&2; exit 2; }
command -v psql >/dev/null || { echo "FAIL: psql is required." >&2; exit 2; }

# Parse/validate archive before connecting to the destination.
pg_restore --list "$BACKUP_FILE" >/dev/null
actual_db="$(psql "$RESTORE_TARGET_DATABASE_URL" -X -A -t -v ON_ERROR_STOP=1 -c 'select current_database()')"
if [[ "$actual_db" != "$RESTORE_TARGET_DATABASE_NAME" ]]; then
  echo "FAIL: target URL resolves to a different database than RESTORE_TARGET_DATABASE_NAME." >&2; exit 2
fi
public_tables="$(psql "$RESTORE_TARGET_DATABASE_URL" -X -A -t -v ON_ERROR_STOP=1 -c "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'")"
if [[ "$public_tables" != "0" ]]; then
  echo "FAIL: destination public schema is not empty ($public_tables tables). Use a newly provisioned isolated database." >&2; exit 2
fi

start_epoch="$(date +%s)"
echo "RESTORE START database=$actual_db backup_bytes=$(wc -c < "$BACKUP_FILE" | tr -d ' ')"
pg_restore --exit-on-error --no-owner --no-privileges --dbname="$RESTORE_TARGET_DATABASE_URL" "$BACKUP_FILE"

# Require core tables and query their row counts. Missing relations or query errors fail the rehearsal.
psql "$RESTORE_TARGET_DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['companies','projects','project_estimates','project_estimate_items','purchase_orders','supplier_invoices','inventory_balances','inventory_transactions','project_progress_measurements','accounts_receivable_invoices','accounting_journals','accounting_journal_lines'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN RAISE EXCEPTION 'Required table missing after restore: %', t; END IF;
  END LOOP;
END $$;
select 'companies=' || count(*) from public.companies;
select 'projects=' || count(*) from public.projects;
select 'project_estimates=' || count(*) from public.project_estimates;
select 'estimate_items=' || count(*) from public.project_estimate_items;
select 'purchase_orders=' || count(*) from public.purchase_orders;
select 'inventory_balances=' || count(*) from public.inventory_balances;
select 'inventory_transactions=' || count(*) from public.inventory_transactions;
select 'progress_measurements=' || count(*) from public.project_progress_measurements;
select 'supplier_invoices=' || count(*) from public.supplier_invoices;
select 'ar_invoices=' || count(*) from public.accounts_receivable_invoices;
select 'posted_journals=' || count(*) from public.accounting_journals where status='POSTED';
select 'journal_lines=' || count(*) from public.accounting_journal_lines;
SQL
end_epoch="$(date +%s)"
echo "RESTORE PASS database=$actual_db elapsed_seconds=$((end_epoch-start_epoch))"
echo "NOTE: record backup timestamp (RPO), restore elapsed time (RTO), representative balances, and storage-object restoration separately. This script restores database content only."
