-- V1.14: atomic customer receipts, invoice balance, journal and optional idempotency key.
begin;

alter table public.accounts_receivable_payments
  add column if not exists idempotency_key text;
create unique index if not exists accounts_receivable_payments_company_idempotency_uq
  on public.accounts_receivable_payments(company_id, idempotency_key)
  where idempotency_key is not null;

create or replace function public.post_receivable_payment_atomic(
  p_company_id uuid,
  p_invoice_id uuid,
  p_payment_id uuid,
  p_payment_no text,
  p_payment_date date,
  p_amount numeric,
  p_currency text,
  p_method text,
  p_reference text,
  p_created_by uuid,
  p_idempotency_key text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.accounts_receivable_invoices%rowtype;
  v_existing public.accounts_receivable_payments%rowtype;
  v_payment public.accounts_receivable_payments%rowtype;
  v_amount numeric(20,4);
  v_paid numeric(20,4);
  v_status text;
  v_cash_account uuid;
  v_receivable_account uuid;
  v_journal_id uuid;
  v_journal_no text;
  v_key text;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'Payment amount must be greater than zero'; end if;
  if p_payment_no is null or length(trim(p_payment_no)) = 0 then raise exception 'Payment number is required'; end if;
  if p_method is null or length(trim(p_method)) < 2 then raise exception 'Payment method is required'; end if;
  v_amount := round(p_amount,4);
  v_key := nullif(trim(p_idempotency_key),'');
  if v_key is not null and length(v_key) > 120 then raise exception 'Payment idempotency key is too long'; end if;

  select * into v_invoice from public.accounts_receivable_invoices
   where company_id=p_company_id and id=p_invoice_id for update;
  if not found then raise exception 'Receivable invoice not found for this company'; end if;

  -- The invoice lock serializes same-invoice retries; the unique index prevents
  -- the same company key from creating a second payment against another invoice.
  if v_key is not null then
    select * into v_existing from public.accounts_receivable_payments
     where company_id=p_company_id and idempotency_key=v_key;
    if found then
      if v_existing.invoice_id <> v_invoice.id
        or round(v_existing.amount,4) <> v_amount
        or upper(v_existing.currency) <> upper(coalesce(p_currency,''))
        or lower(v_existing.method) <> lower(trim(p_method))
        or coalesce(v_existing.reference,'') <> coalesce(nullif(trim(p_reference),''),'') then
        raise exception 'Idempotency key was already used with a different payment payload';
      end if;
      return to_jsonb(v_existing);
    end if;
  end if;

  if v_invoice.status not in ('ISSUED','PARTIALLY_PAID') then raise exception 'Receivable invoice must be issued before payment'; end if;
  if upper(coalesce(p_currency,'')) <> upper(coalesce(v_invoice.currency,'')) then raise exception 'Payment currency must match receivable invoice currency'; end if;
  if v_amount > round(coalesce(v_invoice.total,0)-coalesce(v_invoice.amount_paid,0),4) then raise exception 'Payment exceeds receivable invoice balance'; end if;

  select id into v_cash_account from public.chart_of_accounts where company_id=p_company_id and code='1000' and active=true;
  select id into v_receivable_account from public.chart_of_accounts where company_id=p_company_id and code='1100' and active=true;
  if v_cash_account is null or v_receivable_account is null then raise exception 'Required receivables-payment accounting accounts are not configured'; end if;

  insert into public.accounts_receivable_payments (
    id,company_id,invoice_id,payment_no,payment_date,amount,currency,method,reference,status,created_by,idempotency_key
  ) values (
    coalesce(p_payment_id,gen_random_uuid()),p_company_id,v_invoice.id,trim(p_payment_no),coalesce(p_payment_date,current_date),v_amount,
    upper(trim(p_currency)),trim(p_method),nullif(trim(p_reference),''),'POSTED',p_created_by,v_key
  ) returning * into v_payment;

  v_paid := round(coalesce(v_invoice.amount_paid,0)+v_amount,4);
  v_status := case when v_paid >= v_invoice.total then 'PAID' else 'PARTIALLY_PAID' end;
  update public.accounts_receivable_invoices set amount_paid=v_paid,status=v_status,updated_at=now()
   where company_id=p_company_id and id=v_invoice.id;

  v_journal_id := gen_random_uuid();
  v_journal_no := 'JV-RP-' || substr(replace(v_payment.id::text,'-',''),1,20);
  insert into public.accounting_journals (
    id,company_id,journal_no,journal_date,reference,description,status,source_type,source_id,created_by,posted_by,posted_at
  ) values (
    v_journal_id,p_company_id,v_journal_no,v_payment.payment_date,v_payment.payment_no,
    'Customer payment ' || v_payment.payment_no,'POSTED','AR_PAYMENT',v_payment.id,p_created_by,p_created_by,now()
  );
  insert into public.accounting_journal_lines (id,journal_id,account_id,description,debit,credit,currency) values
    (gen_random_uuid(),v_journal_id,v_cash_account,'Customer payment ' || v_payment.payment_no,v_amount,0,upper(trim(p_currency))),
    (gen_random_uuid(),v_journal_id,v_receivable_account,'Customer payment ' || v_payment.payment_no,0,v_amount,upper(trim(p_currency)));

  return to_jsonb(v_payment);
end;
$$;

revoke all on function public.post_receivable_payment_atomic(uuid,uuid,uuid,text,date,numeric,text,text,text,uuid,text) from public, anon, authenticated;
grant execute on function public.post_receivable_payment_atomic(uuid,uuid,uuid,text,date,numeric,text,text,text,uuid,text) to service_role;
notify pgrst, 'reload schema';
commit;
