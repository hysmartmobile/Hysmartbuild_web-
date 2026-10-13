-- V5.9 Daily Operating Loop: explicit evidence and verification for action closure.
-- Additive only: existing outcome rows and action workflows remain intact.
begin;
alter table public.daily_intelligence_outcomes
  add column if not exists evidence_reference text,
  add column if not exists verified_by uuid references auth.users(id) on delete set null,
  add column if not exists verified_at timestamptz;
create index if not exists daily_intelligence_outcomes_action_idx
  on public.daily_intelligence_outcomes(company_id, action_id, measured_at desc);
commit;
