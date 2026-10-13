-- V1.3 SaaS subscriptions, billing transactions and Paystack/Flutterwave reconciliation
create extension if not exists pgcrypto;

create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  currency text not null default 'NGN' check (char_length(currency)=3),
  monthly_amount numeric(14,2) not null default 0 check (monthly_amount >= 0),
  yearly_amount numeric(14,2) not null default 0 check (yearly_amount >= 0),
  max_users integer not null default 5 check (max_users > 0),
  max_projects integer not null default 3 check (max_projects > 0),
  max_storage_mb integer not null default 1024 check (max_storage_mb > 0),
  active boolean not null default true,
  paystack_monthly_plan_code text,
  paystack_yearly_plan_code text,
  flutterwave_monthly_plan_id bigint,
  flutterwave_yearly_plan_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies(id) on delete cascade,
  plan_id uuid not null references public.subscription_plans(id),
  status text not null default 'TRIAL' check (status in ('TRIAL','ACTIVE','PAST_DUE','CANCELLED','EXPIRED')),
  billing_interval text not null default 'MONTHLY' check (billing_interval in ('MONTHLY','YEARLY')),
  provider text check (provider in ('PAYSTACK','FLUTTERWAVE')),
  provider_customer_id text,
  provider_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  trial_ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_transactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  plan_id uuid not null references public.subscription_plans(id),
  provider text not null check (provider in ('PAYSTACK','FLUTTERWAVE')),
  reference text not null,
  provider_transaction_id text,
  amount numeric(14,2) not null check (amount > 0),
  currency text not null check (char_length(currency)=3),
  billing_interval text not null check (billing_interval in ('MONTHLY','YEARLY')),
  status text not null default 'PENDING' check (status in ('PENDING','SUCCESS','FAILED','ABANDONED','REVERSED')),
  checkout_url text,
  provider_customer_id text,
  metadata jsonb not null default '{}'::jsonb,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, reference)
);

create table if not exists public.billing_invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  subscription_id uuid references public.company_subscriptions(id) on delete set null,
  transaction_id uuid references public.billing_transactions(id) on delete set null,
  invoice_number text not null unique,
  amount numeric(14,2) not null,
  currency text not null check (char_length(currency)=3),
  status text not null default 'PAID' check (status in ('DRAFT','OPEN','PAID','VOID','UNCOLLECTIBLE')),
  due_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.billing_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('PAYSTACK','FLUTTERWAVE')),
  provider_event_id text not null,
  event_type text,
  payload jsonb not null,
  processed boolean not null default false,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(provider, provider_event_id)
);

create index if not exists idx_company_subscriptions_company on public.company_subscriptions(company_id);
create index if not exists idx_billing_transactions_company on public.billing_transactions(company_id, created_at desc);
create index if not exists idx_billing_invoices_company on public.billing_invoices(company_id, created_at desc);

insert into public.subscription_plans(code,name,description,currency,monthly_amount,yearly_amount,max_users,max_projects,max_storage_mb)
values
('STARTER','Starter','For small construction teams','NGN',15000,150000,10,10,5120),
('GROWTH','Growth','For growing construction companies','NGN',35000,350000,30,50,20480),
('BUSINESS','Business','For larger construction operations','NGN',75000,750000,100,200,102400)
on conflict(code) do update set name=excluded.name,description=excluded.description,currency=excluded.currency,monthly_amount=excluded.monthly_amount,yearly_amount=excluded.yearly_amount,max_users=excluded.max_users,max_projects=excluded.max_projects,max_storage_mb=excluded.max_storage_mb,updated_at=now();

-- Keep these tables private to authenticated application access; service role handles gateway reconciliation.
alter table public.subscription_plans enable row level security;
alter table public.company_subscriptions enable row level security;
alter table public.billing_transactions enable row level security;
alter table public.billing_invoices enable row level security;
alter table public.billing_webhook_events enable row level security;

drop policy if exists subscription_plans_authenticated_read on public.subscription_plans;
create policy subscription_plans_authenticated_read on public.subscription_plans for select to authenticated using (active = true);

-- Tenant records are intentionally not broadly client-writable. Backend service-role operations are used for billing mutations.
drop policy if exists company_subscriptions_member_read on public.company_subscriptions;
create policy company_subscriptions_member_read on public.company_subscriptions for select to authenticated using (exists (select 1 from public.company_members m where m.company_id = company_subscriptions.company_id and m.user_id = auth.uid() and m.status = 'ACTIVE'));

drop policy if exists billing_transactions_member_read on public.billing_transactions;
create policy billing_transactions_member_read on public.billing_transactions for select to authenticated using (exists (select 1 from public.company_members m where m.company_id = billing_transactions.company_id and m.user_id = auth.uid() and m.status = 'ACTIVE'));

drop policy if exists billing_invoices_member_read on public.billing_invoices;
create policy billing_invoices_member_read on public.billing_invoices for select to authenticated using (exists (select 1 from public.company_members m where m.company_id = billing_invoices.company_id and m.user_id = auth.uid() and m.status = 'ACTIVE'));

-- Permissions
insert into public.permissions(key,description) values
('billing:read','View company subscription and billing records'),
('billing:checkout','Start a company subscription checkout'),
('billing:manage','Manage company billing settings'),
('billing:admin','Manage platform subscription plans and billing administration')
on conflict(key) do update set description=excluded.description;

delete from public.role_permissions where permission_key in ('billing:read','billing:checkout','billing:manage','billing:admin');
insert into public.role_permissions(role,permission_key) values
('SUPER_ADMIN','billing:read'),('SUPER_ADMIN','billing:checkout'),('SUPER_ADMIN','billing:manage'),('SUPER_ADMIN','billing:admin'),
('COMPANY_OWNER','billing:read'),('COMPANY_OWNER','billing:checkout'),('COMPANY_OWNER','billing:manage'),
('COMPANY_ADMIN','billing:read'),('COMPANY_ADMIN','billing:checkout'),
('DIRECTOR','billing:read'),('DIRECTOR','billing:checkout'),
('ACCOUNTANT','billing:read');

create or replace function public.begin_billing_transaction(
  p_company_id uuid,
  p_user_id uuid,
  p_plan_id uuid,
  p_provider text,
  p_reference text,
  p_amount numeric,
  p_currency text,
  p_billing_interval text,
  p_checkout_url text,
  p_metadata jsonb default '{}'::jsonb
) returns public.billing_transactions
language plpgsql security definer set search_path = public
as $$
declare v_row public.billing_transactions; v_member boolean; v_plan public.subscription_plans;
begin
  if auth.uid() <> p_user_id then raise exception 'AUTH_IDENTITY_MISMATCH'; end if;
  select exists(select 1 from company_members where company_id=p_company_id and user_id=p_user_id and status='ACTIVE') into v_member;
  if not v_member then raise exception 'COMPANY_ACCESS_DENIED'; end if;
  select * into v_plan from subscription_plans where id=p_plan_id and active=true;
  if not found then raise exception 'PLAN_NOT_FOUND'; end if;
  if upper(p_currency) <> upper(v_plan.currency) then raise exception 'CURRENCY_MISMATCH'; end if;
  if p_billing_interval='MONTHLY' and p_amount <> v_plan.monthly_amount then raise exception 'AMOUNT_MISMATCH'; end if;
  if p_billing_interval='YEARLY' and p_amount <> v_plan.yearly_amount then raise exception 'AMOUNT_MISMATCH'; end if;
  insert into billing_transactions(company_id,plan_id,provider,reference,amount,currency,billing_interval,checkout_url,metadata)
  values(p_company_id,p_plan_id,upper(p_provider),p_reference,p_amount,upper(p_currency),p_billing_interval,p_checkout_url,coalesce(p_metadata,'{}'::jsonb))
  returning * into v_row;
  return v_row;
end $$;

create or replace function public.reconcile_billing_success(
  p_provider text,
  p_reference text,
  p_provider_transaction_id text,
  p_provider_customer_id text,
  p_paid_amount numeric,
  p_paid_currency text,
  p_paid_at timestamptz default now()
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_tx public.billing_transactions; v_sub public.company_subscriptions; v_invoice public.billing_invoices; v_end timestamptz; v_invoice_no text;
begin
  select * into v_tx from billing_transactions where provider=upper(p_provider) and reference=p_reference for update;
  if not found then raise exception 'BILLING_TRANSACTION_NOT_FOUND'; end if;
  if upper(p_paid_currency) <> upper(v_tx.currency) or round(p_paid_amount,2) <> round(v_tx.amount,2) then raise exception 'PAYMENT_AMOUNT_OR_CURRENCY_MISMATCH'; end if;
  if v_tx.status='SUCCESS' then return jsonb_build_object('status','already_processed','transaction_id',v_tx.id); end if;
  update billing_transactions set status='SUCCESS',provider_transaction_id=p_provider_transaction_id,provider_customer_id=p_provider_customer_id,paid_at=coalesce(p_paid_at,now()),updated_at=now() where id=v_tx.id;
  select * into v_sub from company_subscriptions where company_id=v_tx.company_id for update;
  if not found then
    insert into company_subscriptions(company_id,plan_id,status,billing_interval,provider,provider_customer_id,current_period_start,current_period_end)
    values(v_tx.company_id,v_tx.plan_id,'ACTIVE',v_tx.billing_interval,upper(p_provider),p_provider_customer_id,now(),case when v_tx.billing_interval='YEARLY' then now()+interval '1 year' else now()+interval '1 month' end)
    returning * into v_sub;
  else
    v_end := case when v_sub.status='ACTIVE' and v_sub.current_period_end > now() then v_sub.current_period_end else now() end;
    v_end := case when v_tx.billing_interval='YEARLY' then v_end + interval '1 year' else v_end + interval '1 month' end;
    update company_subscriptions set plan_id=v_tx.plan_id,status='ACTIVE',billing_interval=v_tx.billing_interval,provider=upper(p_provider),provider_customer_id=coalesce(p_provider_customer_id,provider_customer_id),current_period_start=case when v_sub.status='ACTIVE' and v_sub.current_period_start is not null then v_sub.current_period_start else now() end,current_period_end=v_end,cancel_at_period_end=false,updated_at=now() where id=v_sub.id returning * into v_sub;
  end if;
  v_invoice_no := 'HS-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(v_tx.id::text,'-',''),1,10));
  insert into billing_invoices(company_id,subscription_id,transaction_id,invoice_number,amount,currency,status,paid_at)
  values(v_tx.company_id,v_sub.id,v_tx.id,v_invoice_no,v_tx.amount,v_tx.currency,'PAID',coalesce(p_paid_at,now()))
  on conflict(invoice_number) do nothing
  returning * into v_invoice;
  return jsonb_build_object('status','processed','transaction_id',v_tx.id,'subscription_id',v_sub.id,'invoice_id',coalesce(v_invoice.id,null));
end $$;

create or replace function public.mark_billing_transaction_failed(p_provider text,p_reference text,p_status text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  update billing_transactions set status=upper(p_status),updated_at=now() where provider=upper(p_provider) and reference=p_reference and status='PENDING';
  return found;
end $$;

grant execute on function public.begin_billing_transaction(uuid,uuid,uuid,text,text,numeric,text,text,text,jsonb) to authenticated;
grant execute on function public.reconcile_billing_success(text,text,text,text,numeric,text,timestamptz) to service_role;
grant execute on function public.mark_billing_transaction_failed(text,text,text) to service_role;
revoke execute on function public.reconcile_billing_success(text,text,text,text,numeric,text,timestamptz) from public,anon,authenticated;
revoke execute on function public.mark_billing_transaction_failed(text,text,text) from public,anon,authenticated;
