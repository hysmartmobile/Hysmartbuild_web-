-- HySmart Build V1.4.3
-- Global company identity + one-created-company rule + country/currency pricing + trial lifecycle.

-- ---------------------------------------------------------------------------
-- 1. Global company identity.
-- ---------------------------------------------------------------------------
alter table public.companies
  add column if not exists country_code text,
  add column if not exists currency_code text,
  add column if not exists timezone text,
  add column if not exists locale text,
  add column if not exists billing_country_code text,
  add column if not exists tax_country_code text,
  add column if not exists unit_system text not null default 'METRIC';

alter table public.companies
  drop constraint if exists companies_unit_system_check;
alter table public.companies
  add constraint companies_unit_system_check check (unit_system in ('METRIC','IMPERIAL'));

-- Do not silently destroy duplicate owners. If duplicates already exist, stop and
-- make the operator resolve them before enabling the invariant.
do $$
declare duplicate_count integer;
begin
  select count(*) into duplicate_count
  from (
    select created_by
    from public.companies
    group by created_by
    having count(*) > 1
  ) d;
  if duplicate_count > 0 then
    raise exception 'V1_4_3_COMPANY_OWNER_DUPLICATES_EXIST: resolve duplicate companies.created_by ownership before applying the unique rule';
  end if;
end $$;

create unique index if not exists companies_one_created_company_per_user_idx
  on public.companies(created_by);

-- ---------------------------------------------------------------------------
-- 2. Country/currency catalog. This is configuration, not application logic.
-- ---------------------------------------------------------------------------
create table if not exists public.billing_countries (
  country_code text primary key,
  name text not null,
  currency_code text not null,
  locale text not null,
  timezone text not null,
  unit_system text not null default 'METRIC' check (unit_system in ('METRIC','IMPERIAL')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscription_plan_prices (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.subscription_plans(id) on delete cascade,
  country_code text not null references public.billing_countries(country_code),
  currency_code text not null check (char_length(currency_code)=3),
  monthly_amount numeric(14,2) not null check (monthly_amount >= 0),
  yearly_amount numeric(14,2) not null check (yearly_amount >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(plan_id, country_code, currency_code)
);

alter table public.subscription_plan_prices add column if not exists stripe_product_id text;
alter table public.subscription_plan_prices add column if not exists stripe_monthly_price_id text;
alter table public.subscription_plan_prices add column if not exists stripe_yearly_price_id text;
alter table public.subscription_plan_prices add column if not exists paystack_monthly_plan_code text;
alter table public.subscription_plan_prices add column if not exists paystack_yearly_plan_code text;
alter table public.subscription_plan_prices add column if not exists flutterwave_monthly_plan_id bigint;
alter table public.subscription_plan_prices add column if not exists flutterwave_yearly_plan_id bigint;

create table if not exists public.payment_provider_routes (
  id uuid primary key default gen_random_uuid(),
  country_code text not null references public.billing_countries(country_code) on delete cascade,
  currency_code text not null check (char_length(currency_code)=3),
  provider text not null check (provider in ('PAYSTACK','FLUTTERWAVE','STRIPE')),
  priority integer not null default 100,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(country_code, currency_code, provider)
);

create index if not exists subscription_plan_prices_lookup_idx
  on public.subscription_plan_prices(plan_id, country_code, currency_code, active);
create index if not exists payment_provider_routes_lookup_idx
  on public.payment_provider_routes(country_code, currency_code, enabled, priority);

-- ---------------------------------------------------------------------------
-- 3. Supported initial markets. More countries can be added without code changes.
-- ---------------------------------------------------------------------------
insert into public.billing_countries(country_code,name,currency_code,locale,timezone,unit_system) values
('NG','Nigeria','NGN','en-NG','Africa/Lagos','METRIC'),
('GH','Ghana','GHS','en-GH','Africa/Accra','METRIC'),
('KE','Kenya','KES','en-KE','Africa/Nairobi','METRIC'),
('ZA','South Africa','ZAR','en-ZA','Africa/Johannesburg','METRIC'),
('RW','Rwanda','RWF','en-RW','Africa/Kigali','METRIC'),
('TZ','Tanzania','TZS','en-TZ','Africa/Dar_es_Salaam','METRIC'),
('UG','Uganda','UGX','en-UG','Africa/Kampala','METRIC'),
('ZM','Zambia','ZMW','en-ZM','Africa/Lusaka','METRIC'),
('MW','Malawi','MWK','en-MW','Africa/Blantyre','METRIC'),
('SL','Sierra Leone','SLL','en-SL','Africa/Freetown','METRIC'),
('CI','Côte d’Ivoire','XOF','fr-CI','Africa/Abidjan','METRIC'),
('SN','Senegal','XOF','fr-SN','Africa/Dakar','METRIC'),
('CM','Cameroon','XAF','fr-CM','Africa/Douala','METRIC'),
('EG','Egypt','EGP','en-EG','Africa/Cairo','METRIC'),
('ET','Ethiopia','ETB','en-ET','Africa/Addis_Ababa','METRIC'),
('MA','Morocco','MAD','fr-MA','Africa/Casablanca','METRIC'),
('MU','Mauritius','MUR','en-MU','Indian/Mauritius','METRIC'),
('BW','Botswana','BWP','en-BW','Africa/Gaborone','METRIC'),
('NA','Namibia','NAD','en-NA','Africa/Windhoek','METRIC'),
('MZ','Mozambique','MZN','pt-MZ','Africa/Maputo','METRIC'),
('AO','Angola','AOA','pt-AO','Africa/Luanda','METRIC'),
('DZ','Algeria','DZD','fr-DZ','Africa/Algiers','METRIC'),
('TN','Tunisia','TND','fr-TN','Africa/Tunis','METRIC'),
('US','United States','USD','en-US','America/New_York','IMPERIAL'),
('CA','Canada','CAD','en-CA','America/Toronto','METRIC'),
('GB','United Kingdom','GBP','en-GB','Europe/London','METRIC'),
('AE','United Arab Emirates','AED','en-AE','Asia/Dubai','METRIC'),
('SA','Saudi Arabia','SAR','en-SA','Asia/Riyadh','METRIC'),
('AU','Australia','AUD','en-AU','Australia/Sydney','METRIC'),
('IN','India','INR','en-IN','Asia/Kolkata','METRIC'),
('SG','Singapore','SGD','en-SG','Asia/Singapore','METRIC'),
('DE','Germany','EUR','de-DE','Europe/Berlin','METRIC'),
('FR','France','EUR','fr-FR','Europe/Paris','METRIC'),
('NL','Netherlands','EUR','nl-NL','Europe/Amsterdam','METRIC'),
('ES','Spain','EUR','es-ES','Europe/Madrid','METRIC'),
('IT','Italy','EUR','it-IT','Europe/Rome','METRIC'),
('BR','Brazil','BRL','pt-BR','America/Sao_Paulo','METRIC')
on conflict(country_code) do update set name=excluded.name,currency_code=excluded.currency_code,locale=excluded.locale,timezone=excluded.timezone,unit_system=excluded.unit_system,updated_at=now();

-- ---------------------------------------------------------------------------
-- 4. Localized plan prices. Nigeria uses the requested launch pricing.
-- International base pricing follows the previously agreed moderate baseline.
-- Annual pricing is intentionally 10x monthly for a simple 2-month annual saving.
-- ---------------------------------------------------------------------------
with p(code,monthly,yearly) as (
  values ('STARTER',150000::numeric,1500000::numeric),('GROWTH',350000::numeric,3500000::numeric),('BUSINESS',500000::numeric,5000000::numeric)
), c(country_code,currency_code,fx) as (
  values
  ('NG','NGN',1::numeric),('GH','GHS',0.009::numeric),('KE','KES',0.008::numeric),('ZA','ZAR',0.009::numeric),
  ('RW','RWF',0.00075::numeric),('TZ','TZS',0.00061::numeric),('UG','UGX',0.00056::numeric),('ZM','ZMW',0.055::numeric),
  ('MW','MWK',0.00058::numeric),('SL','SLL',0.000068::numeric),('CI','XOF',0.0017::numeric),('SN','XOF',0.0017::numeric),
  ('CM','XAF',0.0017::numeric),('EG','EGP',0.0020::numeric),('ET','ETB',0.0068::numeric),('MA','MAD',0.0067::numeric),
  ('MU','MUR',0.0035::numeric),('BW','BWP',0.0060::numeric),('NA','NAD',0.010::numeric),('MZ','MZN',0.00098::numeric),
  ('AO','AOA',0.0012::numeric),('DZ','DZD',0.0070::numeric),('TN','TND',0.0031::numeric),
  ('US','USD',0.00065::numeric),('CA','CAD',0.00088::numeric),('GB','GBP',0.00051::numeric),('AE','AED',0.0024::numeric),
  ('SA','SAR',0.0024::numeric),('AU','AUD',0.0010::numeric),('IN','INR',0.054::numeric),('SG','SGD',0.00087::numeric),
  ('DE','EUR',0.00060::numeric),('FR','EUR',0.00060::numeric),('NL','EUR',0.00060::numeric),('ES','EUR',0.00060::numeric),
  ('IT','EUR',0.00060::numeric),('BR','BRL',0.0034::numeric)
)
insert into public.subscription_plan_prices(plan_id,country_code,currency_code,monthly_amount,yearly_amount)
select sp.id,c.country_code,c.currency_code,
       case when c.country_code='NG' then p.monthly else greatest(round(p.monthly*c.fx/5)*5,1) end,
       case when c.country_code='NG' then p.yearly else greatest(round(p.yearly*c.fx/5)*5,1) end
from p
join public.subscription_plans sp on sp.code = p.code
cross join c
on conflict(plan_id,country_code,currency_code) do update set monthly_amount=excluded.monthly_amount,yearly_amount=excluded.yearly_amount,active=true,updated_at=now();

-- Exact international baseline requested for USD, GBP and keep NGN exact.
update public.subscription_plan_prices x set monthly_amount=v.monthly_amount,yearly_amount=v.yearly_amount,updated_at=now()
from (values
('STARTER','US','USD',149::numeric,1490::numeric),('GROWTH','US','USD',349::numeric,3490::numeric),('BUSINESS','US','USD',499::numeric,4990::numeric),
('STARTER','GB','GBP',119::numeric,1190::numeric),('GROWTH','GB','GBP',279::numeric,2790::numeric),('BUSINESS','GB','GBP',399::numeric,3990::numeric),
('STARTER','NG','NGN',150000::numeric,1500000::numeric),('GROWTH','NG','NGN',350000::numeric,3500000::numeric),('BUSINESS','NG','NGN',500000::numeric,5000000::numeric)
) v(code,country,currency,monthly_amount,yearly_amount)
join public.subscription_plans sp on sp.code=v.code
where x.plan_id=sp.id and x.country_code=v.country and x.currency_code=v.currency;

-- ---------------------------------------------------------------------------
-- 5. Provider routing. Paystack is limited to merchant countries it currently
-- serves; Flutterwave provides broader African currency/method coverage.
-- Stripe is available as an international provider where HySmart has a Stripe
-- merchant account. Routing is configuration, not an assumption of availability.
-- ---------------------------------------------------------------------------
insert into public.payment_provider_routes(country_code,currency_code,provider,priority) values
('NG','NGN','PAYSTACK',10),('NG','NGN','FLUTTERWAVE',20),('NG','USD','PAYSTACK',10),('NG','USD','FLUTTERWAVE',20),
('GH','GHS','PAYSTACK',10),('GH','GHS','FLUTTERWAVE',20),
('KE','KES','PAYSTACK',10),('KE','KES','FLUTTERWAVE',20),('KE','USD','PAYSTACK',10),('KE','USD','FLUTTERWAVE',20),
('ZA','ZAR','PAYSTACK',10),('ZA','ZAR','FLUTTERWAVE',20),
('CI','XOF','PAYSTACK',10),('CI','XOF','FLUTTERWAVE',20),
('RW','RWF','FLUTTERWAVE',10),('TZ','TZS','FLUTTERWAVE',10),('UG','UGX','FLUTTERWAVE',10),
('ZM','ZMW','FLUTTERWAVE',10),('MW','MWK','FLUTTERWAVE',10),('SL','SLL','FLUTTERWAVE',10),
('SN','XOF','FLUTTERWAVE',10),('CM','XAF','FLUTTERWAVE',10),('EG','EGP','FLUTTERWAVE',10),
('ET','ETB','FLUTTERWAVE',10),('US','USD','PAYSTACK',20),('US','USD','FLUTTERWAVE',30),('US','USD','STRIPE',10),('CA','CAD','STRIPE',10),('GB','GBP','STRIPE',10),
('AE','AED','STRIPE',10),('AU','AUD','STRIPE',10),
('SG','SGD','STRIPE',10),('DE','EUR','STRIPE',10),('FR','EUR','STRIPE',10),('NL','EUR','STRIPE',10),
('ES','EUR','STRIPE',10),('IT','EUR','STRIPE',10),('BR','BRL','STRIPE',10)
on conflict(country_code,currency_code,provider) do update set priority=excluded.priority,enabled=true,updated_at=now();


-- Provider columns in V1.3 only covered the original African gateways. Extend them for the global router.
alter table public.company_subscriptions drop constraint if exists company_subscriptions_provider_check;
alter table public.company_subscriptions add constraint company_subscriptions_provider_check check (provider in ('PAYSTACK','FLUTTERWAVE','STRIPE'));
alter table public.billing_transactions drop constraint if exists billing_transactions_provider_check;
alter table public.billing_transactions add constraint billing_transactions_provider_check check (provider in ('PAYSTACK','FLUTTERWAVE','STRIPE'));
alter table public.billing_webhook_events drop constraint if exists billing_webhook_events_provider_check;
alter table public.billing_webhook_events add constraint billing_webhook_events_provider_check check (provider in ('PAYSTACK','FLUTTERWAVE','STRIPE'));

-- ---------------------------------------------------------------------------
-- 6. Subscription lifecycle extensions.
-- ---------------------------------------------------------------------------
alter table public.company_subscriptions
  drop constraint if exists company_subscriptions_status_check;
alter table public.company_subscriptions
  add constraint company_subscriptions_status_check check (status in ('TRIAL','ACTIVE','PAST_DUE','GRACE_PERIOD','SUSPENDED','CANCELLED','EXPIRED'));

alter table public.company_subscriptions
  add column if not exists grace_period_ends_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancellation_reason text;

-- Existing legacy plans remain usable, but the global pricing table is now the
-- authoritative source for country/currency amounts. Keep legacy columns synced
-- to NGN so older API clients do not receive broken values.
update public.subscription_plans sp
set currency='NGN',monthly_amount=p.monthly_amount,yearly_amount=p.yearly_amount,updated_at=now()
from (values ('STARTER',150000::numeric,1500000::numeric),('GROWTH',350000::numeric,3500000::numeric),('BUSINESS',500000::numeric,5000000::numeric)) p(code,monthly_amount,yearly_amount)
where sp.code=p.code;

-- Automatically start a 14-day Starter trial when a company is created.
create or replace function public.initialize_company_subscription()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare v_plan uuid;
begin
  select id into v_plan from public.subscription_plans where code='STARTER' and active=true limit 1;
  if v_plan is not null then
    insert into public.company_subscriptions(company_id,plan_id,status,billing_interval,current_period_start,current_period_end,trial_ends_at)
    values(new.id,v_plan,'TRIAL','MONTHLY',now(),now()+interval '14 days',now()+interval '14 days')
    on conflict(company_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists companies_initialize_subscription on public.companies;
create trigger companies_initialize_subscription
after insert on public.companies
for each row execute procedure public.initialize_company_subscription();

-- Backfill subscriptions for companies created before V1.4.3, without changing
-- already-paid/active subscriptions.
insert into public.company_subscriptions(company_id,plan_id,status,billing_interval,current_period_start,current_period_end,trial_ends_at)
select c.id,sp.id,'TRIAL','MONTHLY',now(),now()+interval '14 days',now()+interval '14 days'
from public.companies c
cross join lateral (select id from public.subscription_plans where code='STARTER' and active=true limit 1) sp
left join public.company_subscriptions cs on cs.company_id=c.id
where cs.id is null;

-- ---------------------------------------------------------------------------
-- 7. RLS for billing configuration.
-- ---------------------------------------------------------------------------
alter table public.billing_countries enable row level security;
alter table public.subscription_plan_prices enable row level security;
alter table public.payment_provider_routes enable row level security;

drop policy if exists billing_countries_authenticated_read on public.billing_countries;
create policy billing_countries_authenticated_read on public.billing_countries for select to authenticated using (active=true);
drop policy if exists subscription_plan_prices_authenticated_read on public.subscription_plan_prices;
create policy subscription_plan_prices_authenticated_read on public.subscription_plan_prices for select to authenticated using (active=true);
drop policy if exists payment_provider_routes_authenticated_read on public.payment_provider_routes;
create policy payment_provider_routes_authenticated_read on public.payment_provider_routes for select to authenticated using (enabled=true);

-- ---------------------------------------------------------------------------
-- 8. Trigger updated_at.
-- ---------------------------------------------------------------------------
drop trigger if exists billing_countries_updated_at on public.billing_countries;
create trigger billing_countries_updated_at before update on public.billing_countries for each row execute procedure public.set_updated_at();
drop trigger if exists subscription_plan_prices_updated_at on public.subscription_plan_prices;
create trigger subscription_plan_prices_updated_at before update on public.subscription_plan_prices for each row execute procedure public.set_updated_at();
drop trigger if exists payment_provider_routes_updated_at on public.payment_provider_routes;
create trigger payment_provider_routes_updated_at before update on public.payment_provider_routes for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 9. Invitation-based membership for users who cannot create a second company.
-- Invitations are single-use, hashed at rest and expire automatically.
-- ---------------------------------------------------------------------------
create table if not exists public.company_invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  email text not null,
  role text not null check (role in ('COMPANY_ADMIN','DIRECTOR','PROJECT_MANAGER','SITE_ENGINEER','SITE_SUPERVISOR','ACCOUNTANT','STOREKEEPER','HR_MANAGER','WORKER','CLIENT')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  invited_by uuid not null references auth.users(id),
  accepted_at timestamptz,
  accepted_user_id uuid references auth.users(id),
  status text not null default 'PENDING' check (status in ('PENDING','ACCEPTED','EXPIRED','REVOKED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists company_invitations_company_idx on public.company_invitations(company_id,status,created_at desc);
create index if not exists company_invitations_email_idx on public.company_invitations(lower(email),status);
alter table public.company_invitations enable row level security;

insert into public.permissions(key,description) values
('user:invite','Invite users to the company'),
('user:invite:read','View company invitations')
on conflict(key) do update set description=excluded.description;

delete from public.role_permissions where permission_key in ('user:invite','user:invite:read');
insert into public.role_permissions(role,permission_key) values
('SUPER_ADMIN','user:invite'),('SUPER_ADMIN','user:invite:read'),
('COMPANY_OWNER','user:invite'),('COMPANY_OWNER','user:invite:read'),
('COMPANY_ADMIN','user:invite'),('COMPANY_ADMIN','user:invite:read'),
('DIRECTOR','user:invite'),('DIRECTOR','user:invite:read')
on conflict do nothing;

-- Existing company member RLS remains authoritative for company access. Invitation
-- records are read/written through the authenticated Express API using service role.
