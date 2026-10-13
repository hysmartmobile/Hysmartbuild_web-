begin;
create table if not exists public.hysmart_cost_forecast_models (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 project_id uuid not null references public.projects(id) on delete cascade, model_type text not null,
 status text not null check(status in ('READY','INSUFFICIENT_DATA','EVALUATION_FAILED','FAILED')),
 training_sample_count integer not null default 0 check(training_sample_count>=0), class_counts jsonb not null default '{}'::jsonb,
 evaluation_metrics jsonb not null default '{}'::jsonb, parameters jsonb not null default '{}'::jsonb,
 trained_by uuid references auth.users(id) on delete set null, trained_at timestamptz not null default now(), created_at timestamptz not null default now(),
 constraint hysmart_cost_forecast_models_company_project_fk foreign key(company_id,project_id) references public.projects(company_id,id) on delete cascade,
 constraint hysmart_cost_forecast_models_company_project_id_uq unique(company_id,project_id,id)
);
create index if not exists hysmart_cost_forecast_models_latest_idx on public.hysmart_cost_forecast_models(company_id,project_id,model_type,trained_at desc);
create table if not exists public.hysmart_cost_forecast_predictions (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 project_id uuid not null references public.projects(id) on delete cascade, model_id uuid not null references public.hysmart_cost_forecast_models(id) on delete cascade,
 expected_final_cost numeric(20,4) not null, expected_overrun_pct numeric(12,4) not null, predicted_variance_amount numeric(20,4) not null,
 risk_level text not null check(risk_level in ('WITHIN_BUDGET','LOW','MEDIUM','HIGH')), currency text not null check(char_length(currency)=3),
 features jsonb not null default '{}'::jsonb, explanation text not null default '', generated_at timestamptz not null default now(),
 constraint hysmart_cost_forecast_predictions_company_project_fk foreign key(company_id,project_id) references public.projects(company_id,id) on delete cascade,
 constraint hysmart_cost_forecast_predictions_model_fk foreign key(company_id,project_id,model_id) references public.hysmart_cost_forecast_models(company_id,project_id,id) on delete cascade
);
create index if not exists hysmart_cost_forecast_predictions_latest_idx on public.hysmart_cost_forecast_predictions(company_id,project_id,generated_at desc);
alter table public.hysmart_cost_forecast_models enable row level security;
alter table public.hysmart_cost_forecast_predictions enable row level security;
drop policy if exists hysmart_cost_forecast_models_company_read on public.hysmart_cost_forecast_models;
create policy hysmart_cost_forecast_models_company_read on public.hysmart_cost_forecast_models for select using (public.is_company_member(company_id));
drop policy if exists hysmart_cost_forecast_predictions_company_read on public.hysmart_cost_forecast_predictions;
create policy hysmart_cost_forecast_predictions_company_read on public.hysmart_cost_forecast_predictions for select using (public.is_company_member(company_id));
insert into public.permissions(key,description) values ('project-cost-forecast:read','Read trained project cost-overrun forecasts and data readiness') on conflict(key) do update set description=excluded.description;
delete from public.role_permissions where permission_key='project-cost-forecast:read';
insert into public.role_permissions(role,permission_key) values
('SUPER_ADMIN','project-cost-forecast:read'),('COMPANY_OWNER','project-cost-forecast:read'),('COMPANY_ADMIN','project-cost-forecast:read'),('CEO','project-cost-forecast:read'),('DIRECTOR','project-cost-forecast:read'),('MANAGEMENT','project-cost-forecast:read'),('PROJECT_MANAGER','project-cost-forecast:read'),('ACCOUNTANT','project-cost-forecast:read'),('COMMERCIAL_MANAGER','project-cost-forecast:read'),('QUANTITY_SURVEYOR','project-cost-forecast:read') on conflict(role,permission_key) do nothing;
notify pgrst,'reload schema'; commit;
