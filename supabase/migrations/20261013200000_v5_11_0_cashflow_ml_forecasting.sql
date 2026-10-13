begin;
create table if not exists public.hysmart_project_cashflow_observations (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 project_id uuid not null references public.projects(id) on delete cascade, as_of_date date not null, currency text not null check(char_length(currency)=3),
 opening_cash_balance numeric(20,4) not null, inflows_last_30d numeric(20,4) not null check(inflows_last_30d>=0),
 outflows_last_30d numeric(20,4) not null check(outflows_last_30d>=0), receivables_due_next_30d numeric(20,4) not null check(receivables_due_next_30d>=0),
 payables_due_next_30d numeric(20,4) not null check(payables_due_next_30d>=0), minimum_cash_buffer numeric(20,4) not null check(minimum_cash_buffer>=0),
 reconciliation_status text not null default 'DRAFT' check(reconciliation_status in ('DRAFT','RECONCILED')),
 observed_shortfall_next_30d boolean, outcome_observed_at timestamptz, evidence_note text, created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint hysmart_cashflow_observation_company_project_fk foreign key(company_id,project_id) references public.projects(company_id,id) on delete cascade,
 constraint hysmart_cashflow_observation_unique_date unique(company_id,project_id,as_of_date),
 constraint hysmart_cashflow_observation_company_id_uq unique(company_id,id),
 constraint hysmart_cashflow_outcome_after_window check(observed_shortfall_next_30d is null or outcome_observed_at is not null)
);
create index if not exists hysmart_cashflow_observation_history_idx on public.hysmart_project_cashflow_observations(company_id,project_id,as_of_date desc);
create table if not exists public.hysmart_cashflow_forecast_models (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 model_type text not null, status text not null check(status in ('READY','INSUFFICIENT_DATA','EVALUATION_FAILED','FAILED')),
 training_sample_count integer not null default 0 check(training_sample_count>=0), project_count integer not null default 0 check(project_count>=0),
 evaluation_metrics jsonb not null default '{}'::jsonb, parameters jsonb not null default '{}'::jsonb,
 trained_by uuid references auth.users(id) on delete set null, trained_at timestamptz not null default now(), created_at timestamptz not null default now(),
 constraint hysmart_cashflow_model_company_id_uq unique(company_id,id)
);
create index if not exists hysmart_cashflow_models_latest_idx on public.hysmart_cashflow_forecast_models(company_id,model_type,trained_at desc);
create table if not exists public.hysmart_cashflow_forecast_predictions (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 project_id uuid not null references public.projects(id) on delete cascade, model_id uuid not null references public.hysmart_cashflow_forecast_models(id) on delete cascade,
 observation_id uuid not null references public.hysmart_project_cashflow_observations(id) on delete restrict,
 shortfall_probability_pct numeric(8,4) not null check(shortfall_probability_pct between 0 and 100), risk_level text not null check(risk_level in ('LOW','ELEVATED','HIGH','CRITICAL')),
 currency text not null check(char_length(currency)=3), features jsonb not null default '{}'::jsonb, explanation text not null,
 generated_at timestamptz not null default now(), constraint hysmart_cashflow_prediction_company_project_fk foreign key(company_id,project_id) references public.projects(company_id,id) on delete cascade,
 constraint hysmart_cashflow_prediction_company_model_fk foreign key(company_id,model_id) references public.hysmart_cashflow_forecast_models(company_id,id) on delete cascade,
 constraint hysmart_cashflow_prediction_company_observation_fk foreign key(company_id,observation_id) references public.hysmart_project_cashflow_observations(company_id,id) on delete restrict
);
create index if not exists hysmart_cashflow_predictions_latest_idx on public.hysmart_cashflow_forecast_predictions(company_id,project_id,generated_at desc);
alter table public.hysmart_project_cashflow_observations enable row level security;
alter table public.hysmart_cashflow_forecast_models enable row level security;
alter table public.hysmart_cashflow_forecast_predictions enable row level security;
drop policy if exists hysmart_cashflow_observations_company_read on public.hysmart_project_cashflow_observations;
create policy hysmart_cashflow_observations_company_read on public.hysmart_project_cashflow_observations for select using (public.is_company_member(company_id));
drop policy if exists hysmart_cashflow_models_company_read on public.hysmart_cashflow_forecast_models;
create policy hysmart_cashflow_models_company_read on public.hysmart_cashflow_forecast_models for select using (public.is_company_member(company_id));
drop policy if exists hysmart_cashflow_predictions_company_read on public.hysmart_cashflow_forecast_predictions;
create policy hysmart_cashflow_predictions_company_read on public.hysmart_cashflow_forecast_predictions for select using (public.is_company_member(company_id));
insert into public.permissions(key,description) values
 ('cashflow-forecast:read','Read cash-shortfall ML readiness and forecasts'),('cashflow-observation:manage','Record and reconcile dated project cashflow observations')
on conflict(key) do update set description=excluded.description;
delete from public.role_permissions where permission_key in ('cashflow-forecast:read','cashflow-observation:manage');
insert into public.role_permissions(role,permission_key) values
 ('SUPER_ADMIN','cashflow-forecast:read'),('COMPANY_OWNER','cashflow-forecast:read'),('COMPANY_ADMIN','cashflow-forecast:read'),('CEO','cashflow-forecast:read'),('DIRECTOR','cashflow-forecast:read'),('MANAGEMENT','cashflow-forecast:read'),('PROJECT_MANAGER','cashflow-forecast:read'),('ACCOUNTANT','cashflow-forecast:read'),('COMMERCIAL_MANAGER','cashflow-forecast:read'),('QUANTITY_SURVEYOR','cashflow-forecast:read'),
 ('SUPER_ADMIN','cashflow-observation:manage'),('COMPANY_OWNER','cashflow-observation:manage'),('COMPANY_ADMIN','cashflow-observation:manage'),('CEO','cashflow-observation:manage'),('DIRECTOR','cashflow-observation:manage'),('MANAGEMENT','cashflow-observation:manage'),('ACCOUNTANT','cashflow-observation:manage'),('COMMERCIAL_MANAGER','cashflow-observation:manage')
on conflict(role,permission_key) do nothing;
notify pgrst,'reload schema';
commit;
