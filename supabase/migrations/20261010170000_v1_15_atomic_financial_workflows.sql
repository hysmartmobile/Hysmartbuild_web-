-- V1.15: close multi-request transaction gaps in core financial workflows.
-- These functions are intentionally service_role-only; API authorization remains
-- enforced by the backend route/middleware before calling them.
begin;

create or replace function public.approve_supplier_invoice_atomic(
  p_company_id uuid, p_invoice_id uuid, p_user_id uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_invoice public.supplier_invoices%rowtype; v_debit uuid; v_credit uuid; v_journal_id uuid; v_journal_no text;
begin
  select * into v_invoice from public.supplier_invoices where company_id=p_company_id and id=p_invoice_id for update;
  if not found then raise exception 'Supplier invoice not found for this company'; end if;
  if not exists(select 1 from public.suppliers where id=v_invoice.supplier_id and company_id=p_company_id) then raise exception 'Supplier does not belong to this company'; end if;
  if v_invoice.purchase_order_id is not null and not exists(select 1 from public.purchase_orders where id=v_invoice.purchase_order_id and company_id=p_company_id) then raise exception 'Purchase order does not belong to this company'; end if;
  if v_invoice.status='APPROVED' or v_invoice.status in ('PARTIALLY_PAID','PAID') then
    if exists(select 1 from public.accounting_journals where company_id=p_company_id and source_type='SUPPLIER_INVOICE' and source_id=v_invoice.id and status='POSTED') then return to_jsonb(v_invoice); end if;
    raise exception 'Approved supplier invoice has no posted journal';
  end if;
  if v_invoice.status <> 'RECEIVED' then raise exception 'Supplier invoice must be received before approval'; end if;
  if v_invoice.total is null or v_invoice.total <= 0 or round(v_invoice.subtotal+v_invoice.tax,4) <> round(v_invoice.total,4) then raise exception 'Supplier invoice totals are invalid'; end if;
  if exists(select 1 from public.accounting_journals where company_id=p_company_id and source_type='SUPPLIER_INVOICE' and source_id=v_invoice.id) then raise exception 'Supplier invoice journal already exists'; end if;
  select id into v_debit from public.chart_of_accounts where company_id=p_company_id and code='5000' and active=true;
  select id into v_credit from public.chart_of_accounts where company_id=p_company_id and code='2000' and active=true;
  if v_debit is null or v_credit is null then raise exception 'Required supplier-invoice accounting accounts are not configured'; end if;
  v_journal_id:=gen_random_uuid(); v_journal_no:='JV-SI-'||substr(replace(v_invoice.id::text,'-',''),1,20);
  insert into public.accounting_journals(id,company_id,journal_no,journal_date,reference,description,status,source_type,source_id,created_by,posted_by,posted_at)
  values(v_journal_id,p_company_id,v_journal_no,v_invoice.invoice_date,v_invoice.invoice_no,'Supplier invoice '||v_invoice.invoice_no,'POSTED','SUPPLIER_INVOICE',v_invoice.id,p_user_id,p_user_id,now());
  insert into public.accounting_journal_lines(id,journal_id,account_id,project_id,description,debit,credit,currency) values
    (gen_random_uuid(),v_journal_id,v_debit,null,'Supplier invoice '||v_invoice.invoice_no,v_invoice.total,0,v_invoice.currency),
    (gen_random_uuid(),v_journal_id,v_credit,null,'Supplier invoice '||v_invoice.invoice_no,0,v_invoice.total,v_invoice.currency);
  update public.supplier_invoices set status='APPROVED',approved_by=p_user_id,approved_at=now(),updated_at=now()
   where company_id=p_company_id and id=v_invoice.id returning * into v_invoice;
  return to_jsonb(v_invoice);
end; $$;

create or replace function public.create_receivable_invoice_atomic(
  p_company_id uuid,p_invoice_id uuid,p_invoice_no text,p_customer_name text,p_customer_email text,p_project_id uuid,
  p_invoice_date date,p_due_date date,p_currency text,p_subtotal numeric,p_tax numeric,p_total numeric,p_notes text,p_created_by uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_invoice public.accounts_receivable_invoices%rowtype; v_debit uuid; v_credit uuid; v_journal_id uuid; v_journal_no text;
begin
  if nullif(trim(p_customer_name),'') is null then raise exception 'Customer name is required'; end if;
  if nullif(trim(p_invoice_no),'') is null then raise exception 'Invoice number is required'; end if;
  if p_subtotal is null or p_tax is null or p_total is null or p_subtotal<0 or p_tax<0 or p_total<=0 or round(p_subtotal+p_tax,4)<>round(p_total,4) then raise exception 'Receivable invoice totals are invalid'; end if;
  if p_project_id is not null and not exists(select 1 from public.projects where id=p_project_id and company_id=p_company_id) then raise exception 'Project not found for this company'; end if;
  select id into v_debit from public.chart_of_accounts where company_id=p_company_id and code='1100' and active=true;
  select id into v_credit from public.chart_of_accounts where company_id=p_company_id and code='4000' and active=true;
  if v_debit is null or v_credit is null then raise exception 'Required receivables accounting accounts are not configured'; end if;
  insert into public.accounts_receivable_invoices(id,company_id,customer_name,customer_email,project_id,invoice_no,invoice_date,due_date,currency,status,subtotal,tax,total,notes,created_by)
  values(coalesce(p_invoice_id,gen_random_uuid()),p_company_id,trim(p_customer_name),nullif(trim(p_customer_email),''),p_project_id,trim(p_invoice_no),coalesce(p_invoice_date,current_date),p_due_date,upper(coalesce(nullif(trim(p_currency),''),'NGN')),'ISSUED',p_subtotal,p_tax,p_total,nullif(trim(p_notes),''),p_created_by)
  returning * into v_invoice;
  v_journal_id:=gen_random_uuid(); v_journal_no:='JV-AR-'||substr(replace(v_invoice.id::text,'-',''),1,20);
  insert into public.accounting_journals(id,company_id,journal_no,journal_date,reference,description,status,source_type,source_id,created_by,posted_by,posted_at)
  values(v_journal_id,p_company_id,v_journal_no,v_invoice.invoice_date,v_invoice.invoice_no,'AR invoice '||v_invoice.invoice_no,'POSTED','AR_INVOICE',v_invoice.id,p_created_by,p_created_by,now());
  insert into public.accounting_journal_lines(id,journal_id,account_id,project_id,description,debit,credit,currency) values
    (gen_random_uuid(),v_journal_id,v_debit,v_project_id,'AR invoice '||v_invoice.invoice_no,v_invoice.total,0,v_invoice.currency),
    (gen_random_uuid(),v_journal_id,v_credit,v_project_id,'AR invoice '||v_invoice.invoice_no,0,v_invoice.total,v_invoice.currency);
  return to_jsonb(v_invoice);
end; $$;

create or replace function public.post_accounting_journal_atomic(
  p_company_id uuid,p_journal_id uuid,p_journal_no text,p_journal_date date,p_reference text,p_description text,
  p_source_type text,p_source_id uuid,p_created_by uuid,p_lines jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_line jsonb; v_journal public.accounting_journals%rowtype; v_debit numeric:=0; v_credit numeric:=0; v_count integer:=0; v_account uuid; v_project uuid; v_cost_code uuid; v_site uuid; v_d numeric; v_c numeric; v_currency text;
begin
  if nullif(trim(p_description),'') is null then raise exception 'Journal description is required'; end if;
  if coalesce(jsonb_typeof(p_lines),'null')<>'array' or coalesce(jsonb_array_length(p_lines),0)<2 then raise exception 'A journal requires at least two lines'; end if;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_account:=nullif(v_line->>'accountId','')::uuid; v_project:=nullif(v_line->>'projectId','')::uuid; v_cost_code:=nullif(v_line->>'costCodeId','')::uuid; v_site:=nullif(v_line->>'siteId','')::uuid;
    v_d:=coalesce(nullif(v_line->>'debit','')::numeric,0); v_c:=coalesce(nullif(v_line->>'credit','')::numeric,0);
    if v_currency is null then v_currency:=upper(coalesce(nullif(trim(v_line->>'currency'),''),'NGN')); elsif v_currency<>upper(coalesce(nullif(trim(v_line->>'currency'),''),'NGN')) then raise exception 'Journal lines must use one currency'; end if;
    if v_account is null or not exists(select 1 from public.chart_of_accounts where id=v_account and company_id=p_company_id and active=true) then raise exception 'Journal account does not belong to this company'; end if;
    if (v_d<0 or v_c<0) or not ((v_d=0 and v_c>0) or (v_c=0 and v_d>0)) then raise exception 'Journal line debit/credit is invalid'; end if;
    if v_project is not null and not exists(select 1 from public.projects where id=v_project and company_id=p_company_id) then raise exception 'Journal project does not belong to this company'; end if;
    if v_cost_code is not null and not exists(select 1 from public.cost_codes where id=v_cost_code and company_id=p_company_id) then raise exception 'Journal cost code does not belong to this company'; end if;
    if v_site is not null and not exists(select 1 from public.sites where id=v_site and company_id=p_company_id) then raise exception 'Journal site does not belong to this company'; end if;
    v_debit:=v_debit+v_d; v_credit:=v_credit+v_c; v_count:=v_count+1;
  end loop;
  if v_debit<=0 or round(v_debit,4)<>round(v_credit,4) then raise exception 'Journal is not balanced'; end if;
  insert into public.accounting_journals(id,company_id,journal_no,journal_date,reference,description,status,source_type,source_id,created_by,posted_by,posted_at)
  values(coalesce(p_journal_id,gen_random_uuid()),p_company_id,trim(p_journal_no),coalesce(p_journal_date,current_date),nullif(trim(p_reference),''),trim(p_description),'POSTED',p_source_type,p_source_id,p_created_by,p_created_by,now()) returning * into v_journal;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    insert into public.accounting_journal_lines(id,journal_id,account_id,cost_code_id,project_id,site_id,description,debit,credit,currency)
    values(gen_random_uuid(),v_journal.id,(v_line->>'accountId')::uuid,nullif(v_line->>'costCodeId','')::uuid,nullif(v_line->>'projectId','')::uuid,nullif(v_line->>'siteId','')::uuid,nullif(trim(v_line->>'description'),''),coalesce(nullif(v_line->>'debit','')::numeric,0),coalesce(nullif(v_line->>'credit','')::numeric,0),upper(coalesce(nullif(trim(v_line->>'currency'),''),'NGN')));
  end loop;
  return to_jsonb(v_journal);
end; $$;

create or replace function public.create_payroll_run_atomic(
  p_company_id uuid,p_run_id uuid,p_run_no text,p_period_start date,p_period_end date,p_pay_date date,p_notes text,p_created_by uuid,p_items jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_run public.payroll_runs%rowtype; v_item jsonb; v_gross numeric:=0; v_tax numeric:=0; v_deductions numeric:=0; v_item_gross numeric; v_item_tax numeric; v_item_ded numeric; v_currency text;
begin
  if p_period_start is null or p_period_end is null or p_period_end<p_period_start then raise exception 'Payroll period dates are invalid'; end if;
  if coalesce(jsonb_typeof(p_items),'null')<>'array' or coalesce(jsonb_array_length(p_items),0)<1 then raise exception 'At least one payroll item is required'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_item_gross:=coalesce(nullif(v_item->>'grossAmount','')::numeric,0); v_item_tax:=coalesce(nullif(v_item->>'taxAmount','')::numeric,0); v_item_ded:=coalesce(nullif(v_item->>'deductions','')::numeric,0);
    if v_item_gross<0 or v_item_tax<0 or v_item_ded<0 or v_item_tax+v_item_ded>v_item_gross then raise exception 'Payroll item amounts are invalid'; end if;
    if nullif(trim(v_item->>'workerName'),'') is null then raise exception 'Payroll worker name is required'; end if;
    if v_currency is null then v_currency:=upper(coalesce(nullif(trim(v_item->>'currency'),''),'NGN')); elsif v_currency<>upper(coalesce(nullif(trim(v_item->>'currency'),''),'NGN')) then raise exception 'Payroll items must use one currency'; end if;
    if nullif(v_item->>'workerId','') is not null and not exists(select 1 from public.workers where id=(v_item->>'workerId')::uuid and company_id=p_company_id) then raise exception 'Payroll worker does not belong to this company'; end if;
    v_gross:=v_gross+v_item_gross; v_tax:=v_tax+v_item_tax; v_deductions:=v_deductions+v_item_ded;
  end loop;
  if v_gross<=0 then raise exception 'Payroll gross amount must be greater than zero'; end if;
  insert into public.payroll_runs(id,company_id,run_no,period_start,period_end,pay_date,status,gross_amount,tax_amount,deductions,net_amount,notes,created_by)
  values(coalesce(p_run_id,gen_random_uuid()),p_company_id,trim(p_run_no),p_period_start,p_period_end,p_pay_date,'DRAFT',v_gross,v_tax,v_deductions,v_gross-v_tax-v_deductions,nullif(trim(p_notes),''),p_created_by) returning * into v_run;
  for v_item in select value from jsonb_array_elements(p_items) loop
    insert into public.payroll_items(id,payroll_run_id,worker_id,worker_name,gross_amount,tax_amount,deductions,net_amount,currency)
    values(gen_random_uuid(),v_run.id,nullif(v_item->>'workerId','')::uuid,trim(v_item->>'workerName'),coalesce(nullif(v_item->>'grossAmount','')::numeric,0),coalesce(nullif(v_item->>'taxAmount','')::numeric,0),coalesce(nullif(v_item->>'deductions','')::numeric,0),coalesce(nullif(v_item->>'grossAmount','')::numeric,0)-coalesce(nullif(v_item->>'taxAmount','')::numeric,0)-coalesce(nullif(v_item->>'deductions','')::numeric,0),upper(coalesce(nullif(trim(v_item->>'currency'),''),'NGN')));
  end loop;
  return to_jsonb(v_run);
end; $$;

create or replace function public.transition_payroll_run_atomic(p_company_id uuid,p_run_id uuid,p_user_id uuid,p_status text,p_pay_date date default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_run public.payroll_runs%rowtype; v_cash uuid; v_expense uuid; v_liability uuid; v_journal_id uuid; v_journal_no text; v_currency text;
begin
  select * into v_run from public.payroll_runs where company_id=p_company_id and id=p_run_id for update;
  if not found then raise exception 'Payroll run not found for this company'; end if;
  if p_status='APPROVED' then
    if v_run.status<>'DRAFT' then raise exception 'Only draft payroll can be approved'; end if;
    update public.payroll_runs set status='APPROVED',approved_by=p_user_id,updated_at=now() where id=v_run.id returning * into v_run;
  elsif p_status='PAID' then
    if v_run.status='PAID' and exists(select 1 from public.accounting_journals where company_id=p_company_id and source_type='PAYROLL_RUN' and source_id=v_run.id and status='POSTED') then return to_jsonb(v_run); end if;
    if v_run.status<>'APPROVED' then raise exception 'Only approved payroll can be marked paid'; end if;
    select upper(min(currency)) into v_currency from public.payroll_items where payroll_run_id=v_run.id;
    if v_currency is null or exists(select 1 from public.payroll_items where payroll_run_id=v_run.id and upper(currency)<>v_currency) then raise exception 'Payroll items must use one currency'; end if;
    select id into v_cash from public.chart_of_accounts where company_id=p_company_id and code='1000' and active=true;
    select id into v_expense from public.chart_of_accounts where company_id=p_company_id and code='5100' and active=true;
    select id into v_liability from public.chart_of_accounts where company_id=p_company_id and code='2200' and active=true;
    if v_cash is null or v_expense is null or v_liability is null then raise exception 'Required payroll accounting accounts are not configured'; end if;
    if exists(select 1 from public.accounting_journals where company_id=p_company_id and source_type='PAYROLL_RUN' and source_id=v_run.id) then raise exception 'Payroll journal already exists'; end if;
    v_journal_id:=gen_random_uuid(); v_journal_no:='JV-PAY-'||substr(replace(v_run.id::text,'-',''),1,20);
    insert into public.accounting_journals(id,company_id,journal_no,journal_date,reference,description,status,source_type,source_id,created_by,posted_by,posted_at)
      values(v_journal_id,p_company_id,v_journal_no,coalesce(p_pay_date,current_date),v_run.run_no,'Payroll run '||v_run.run_no,'POSTED','PAYROLL_RUN',v_run.id,p_user_id,p_user_id,now());
    insert into public.accounting_journal_lines(id,journal_id,account_id,description,debit,credit,currency)
      values(gen_random_uuid(),v_journal_id,v_expense,'Payroll gross expense '||v_run.run_no,v_run.gross_amount,0,v_currency);
    if v_run.net_amount>0 then
      insert into public.accounting_journal_lines(id,journal_id,account_id,description,debit,credit,currency)
        values(gen_random_uuid(),v_journal_id,v_cash,'Payroll net paid '||v_run.run_no,0,v_run.net_amount,v_currency);
    end if;
    if v_run.tax_amount+v_run.deductions>0 then
      insert into public.accounting_journal_lines(id,journal_id,account_id,description,debit,credit,currency)
        values(gen_random_uuid(),v_journal_id,v_liability,'Payroll tax and deductions '||v_run.run_no,0,v_run.tax_amount+v_run.deductions,v_currency);
    end if;
    update public.payroll_runs set status='PAID',pay_date=coalesce(p_pay_date,current_date),updated_at=now() where id=v_run.id returning * into v_run;
  elsif p_status='VOID' then
    if v_run.status not in ('DRAFT','APPROVED') then raise exception 'Only draft or approved payroll can be voided'; end if;
    update public.payroll_runs set status='VOID',updated_at=now() where id=v_run.id returning * into v_run;
  else raise exception 'Invalid payroll status'; end if;
  return to_jsonb(v_run);
end; $$;

create or replace function public.create_bank_transaction_atomic(
  p_company_id uuid,p_transaction_id uuid,p_bank_account_id uuid,p_transaction_date date,p_reference text,p_description text,
  p_amount numeric,p_transaction_type text,p_source_type text,p_source_id uuid,p_created_by uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_account public.bank_accounts%rowtype; v_tx public.bank_transactions%rowtype;
begin
  select * into v_account from public.bank_accounts where company_id=p_company_id and id=p_bank_account_id and active=true for update;
  if not found then raise exception 'Bank account not found for this company'; end if;
  if p_transaction_date is null or nullif(trim(p_description),'') is null then raise exception 'Bank transaction date and description are required'; end if;
  if p_amount is null or p_amount=0 then raise exception 'Bank transaction amount must be non-zero'; end if;
  if p_transaction_type not in ('CREDIT','DEBIT') then raise exception 'Invalid bank transaction type'; end if;
  insert into public.bank_transactions(id,company_id,bank_account_id,transaction_date,reference,description,amount,transaction_type,reconciled,source_type,source_id,created_by)
  values(coalesce(p_transaction_id,gen_random_uuid()),p_company_id,v_account.id,p_transaction_date,nullif(trim(p_reference),''),trim(p_description),abs(p_amount),p_transaction_type,false,p_source_type,p_source_id,p_created_by)
  returning * into v_tx;
  return to_jsonb(v_tx);
end; $$;

create or replace function public.reconcile_bank_transaction_atomic(p_company_id uuid,p_transaction_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_tx public.bank_transactions%rowtype;
begin
  select * into v_tx from public.bank_transactions where company_id=p_company_id and id=p_transaction_id for update;
  if not found then raise exception 'Bank transaction not found for this company'; end if;
  if not v_tx.reconciled then update public.bank_transactions set reconciled=true,reconciled_at=now() where id=v_tx.id returning * into v_tx; end if;
  return to_jsonb(v_tx);
end; $$;

-- Journal lines inherit tenant visibility from their journal header.
alter table public.accounting_journal_lines enable row level security;
drop policy if exists accounting_journal_lines_member_read on public.accounting_journal_lines;
create policy accounting_journal_lines_member_read on public.accounting_journal_lines
  for select to authenticated using (
    exists (
      select 1 from public.accounting_journals j
      join public.company_members m on m.company_id=j.company_id
      where j.id=accounting_journal_lines.journal_id and m.user_id=auth.uid() and m.status='ACTIVE'
    )
  );

revoke all on function public.approve_supplier_invoice_atomic(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.approve_supplier_invoice_atomic(uuid,uuid,uuid) to service_role;
revoke all on function public.create_receivable_invoice_atomic(uuid,uuid,text,text,text,uuid,date,date,text,numeric,numeric,numeric,text,uuid) from public,anon,authenticated;
grant execute on function public.create_receivable_invoice_atomic(uuid,uuid,text,text,text,uuid,date,date,text,numeric,numeric,numeric,text,uuid) to service_role;
revoke all on function public.post_accounting_journal_atomic(uuid,uuid,text,date,text,text,text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.post_accounting_journal_atomic(uuid,uuid,text,date,text,text,text,uuid,uuid,jsonb) to service_role;
revoke all on function public.create_payroll_run_atomic(uuid,uuid,text,date,date,date,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.create_payroll_run_atomic(uuid,uuid,text,date,date,date,text,uuid,jsonb) to service_role;
revoke all on function public.transition_payroll_run_atomic(uuid,uuid,uuid,text,date) from public,anon,authenticated;
grant execute on function public.transition_payroll_run_atomic(uuid,uuid,uuid,text,date) to service_role;
revoke all on function public.create_bank_transaction_atomic(uuid,uuid,uuid,date,text,text,numeric,text,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.create_bank_transaction_atomic(uuid,uuid,uuid,date,text,text,numeric,text,text,uuid,uuid) to service_role;
revoke all on function public.reconcile_bank_transaction_atomic(uuid,uuid) from public,anon,authenticated;
grant execute on function public.reconcile_bank_transaction_atomic(uuid,uuid) to service_role;
notify pgrst,'reload schema';
commit;
