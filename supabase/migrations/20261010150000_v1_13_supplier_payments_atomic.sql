-- V1.13: serialize supplier payments and invoice balance updates in one transaction.
-- Apply after v1.6 procurement/accounting schema and the later tenant-hardening migrations.
begin;

create or replace function public.post_supplier_payment_atomic(
  p_company_id uuid,
  p_invoice_id uuid,
  p_payment_id uuid,
  p_payment_no text,
  p_payment_date date,
  p_amount numeric,
  p_currency text,
  p_method text,
  p_reference text,
  p_notes text,
  p_created_by uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.supplier_invoices%rowtype;
  v_payment public.supplier_payments%rowtype;
  v_amount numeric(20,4);
  v_paid numeric(20,4);
  v_status text;
  v_payable_account uuid;
  v_cash_account uuid;
  v_journal_id uuid;
  v_journal_no text;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;
  if p_payment_no is null or length(trim(p_payment_no)) = 0 then
    raise exception 'Payment number is required';
  end if;
  if p_method is null or length(trim(p_method)) = 0 then
    raise exception 'Payment method is required';
  end if;

  v_amount := round(p_amount, 4);
  select * into v_invoice
    from public.supplier_invoices
   where company_id = p_company_id and id = p_invoice_id
   for update;
  if not found then raise exception 'Supplier invoice not found for this company'; end if;
  if v_invoice.status not in ('APPROVED','PARTIALLY_PAID') then
    raise exception 'Supplier invoice must be approved before payment';
  end if;
  if upper(coalesce(p_currency,'')) <> upper(coalesce(v_invoice.currency,'')) then
    raise exception 'Payment currency must match supplier invoice currency';
  end if;
  if v_amount <= 0 then raise exception 'Payment amount must be greater than zero'; end if;
  if v_amount > round(coalesce(v_invoice.total,0)-coalesce(v_invoice.amount_paid,0),4) then
    raise exception 'Payment exceeds outstanding supplier invoice balance';
  end if;

  select id into v_payable_account from public.chart_of_accounts where company_id=p_company_id and code='2000' and active=true;
  select id into v_cash_account from public.chart_of_accounts where company_id=p_company_id and code='1000' and active=true;
  if v_payable_account is null or v_cash_account is null then
    raise exception 'Required supplier-payment accounting accounts are not configured';
  end if;

  insert into public.supplier_payments (
    id, company_id, supplier_invoice_id, payment_no, payment_date, amount,
    currency, method, reference, status, notes, created_by
  ) values (
    coalesce(p_payment_id, gen_random_uuid()), p_company_id, v_invoice.id,
    trim(p_payment_no), coalesce(p_payment_date,current_date), v_amount,
    upper(trim(p_currency)), trim(p_method), nullif(trim(p_reference),''),
    'POSTED', nullif(trim(p_notes),''), p_created_by
  ) returning * into v_payment;

  v_paid := round(coalesce(v_invoice.amount_paid,0)+v_amount,4);
  v_status := case when v_paid >= v_invoice.total then 'PAID' else 'PARTIALLY_PAID' end;
  update public.supplier_invoices
     set amount_paid=v_paid, status=v_status, updated_at=now()
   where company_id=p_company_id and id=v_invoice.id;

  -- Keep the posted ledger entry in the same transaction as the payment and
  -- invoice balance. Any journal error rolls the whole operation back.
  v_journal_id := gen_random_uuid();
  v_journal_no := 'JV-SP-' || substr(replace(v_payment.id::text,'-',''),1,20);
  insert into public.accounting_journals (
    id, company_id, journal_no, journal_date, reference, description,
    status, source_type, source_id, created_by, posted_by, posted_at
  ) values (
    v_journal_id, p_company_id, v_journal_no, v_payment.payment_date,
    v_payment.payment_no, 'Supplier payment ' || v_payment.payment_no,
    'POSTED', 'SUPPLIER_PAYMENT', v_payment.id, p_created_by, p_created_by, now()
  );
  insert into public.accounting_journal_lines (
    id, journal_id, account_id, description, debit, credit, currency
  ) values
    (gen_random_uuid(), v_journal_id, v_payable_account, 'Supplier payment ' || v_payment.payment_no, v_amount, 0, upper(trim(p_currency))),
    (gen_random_uuid(), v_journal_id, v_cash_account, 'Supplier payment ' || v_payment.payment_no, 0, v_amount, upper(trim(p_currency)));

  return to_jsonb(v_payment);
end;
$$;

revoke all on function public.post_supplier_payment_atomic(uuid,uuid,uuid,text,date,numeric,text,text,text,text,uuid) from public, anon, authenticated;
grant execute on function public.post_supplier_payment_atomic(uuid,uuid,uuid,text,date,numeric,text,text,text,text,uuid) to service_role;
notify pgrst, 'reload schema';
commit;
