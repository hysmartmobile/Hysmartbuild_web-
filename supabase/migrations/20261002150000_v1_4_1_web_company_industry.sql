-- V1.4.1 Web/backend alignment: persist company industry selected during onboarding.
alter table public.companies add column if not exists industry text;

create index if not exists companies_industry_idx on public.companies(industry);
