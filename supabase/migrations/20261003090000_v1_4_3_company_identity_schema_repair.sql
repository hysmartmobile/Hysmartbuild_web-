-- HySmart Build V1.4.3 schema repair
-- Repairs databases where the company billing identity columns were not present
-- even though the V1.4.3 application code is deployed.
--
-- Safe to run multiple times.

alter table public.companies
  add column if not exists country_code text,
  add column if not exists currency_code text,
  add column if not exists timezone text,
  add column if not exists locale text,
  add column if not exists billing_country_code text,
  add column if not exists tax_country_code text,
  add column if not exists unit_system text;

-- Existing companies inherit their existing country/currency identity where possible.
update public.companies
set
  billing_country_code = coalesce(nullif(billing_country_code, ''), nullif(country_code, '')),
  tax_country_code = coalesce(nullif(tax_country_code, ''), nullif(country_code, '')),
  unit_system = coalesce(nullif(unit_system, ''), 'METRIC')
where billing_country_code is null
   or tax_country_code is null
   or unit_system is null
   or unit_system = '';

-- Keep the application invariant used by V1.4.3.
alter table public.companies
  alter column unit_system set default 'METRIC';

alter table public.companies
  drop constraint if exists companies_unit_system_check;

alter table public.companies
  add constraint companies_unit_system_check
  check (unit_system in ('METRIC','IMPERIAL'));

-- New rows must have a valid unit system.
alter table public.companies
  alter column unit_system set not null;
