-- HySmart Build V5.7.2: require an explicit subscription choice after company setup.
-- Existing subscriptions are preserved; this migration only stops automatic trial creation.
begin;

drop trigger if exists companies_provision_trial on public.companies;
drop trigger if exists companies_initialize_subscription on public.companies;

comment on table public.company_subscriptions is
  'One subscription per company. New companies must explicitly start the 14-day trial or complete paid checkout before workspace access.';

commit;
