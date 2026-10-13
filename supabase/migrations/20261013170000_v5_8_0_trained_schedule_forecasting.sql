begin;

create table if not exists public.hysmart_forecast_models (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  model_type text not null,
  model_version integer not null default 1 check (model_version > 0),
  status text not null check (status in ('READY','INSUFFICIENT_DATA','FAILED')),
  training_sample_count integer not null default 0 check (training_sample_count >= 0),
  class_counts jsonb not null default '{}'::jsonb,
  evaluation_metrics jsonb not null default '{}'::jsonb,
  parameters jsonb not null default '{}'::jsonb,
  trained_at timestamptz not null default now(),
  trained_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint hysmart_forecast_models_company_project_id_uq unique (company_id, project_id, id),
  constraint hysmart_forecast_models_company_project_fk foreign key (company_id, project_id) references public.projects(company_id, id) on delete cascade
);
create index if not exists hysmart_forecast_models_latest_idx on public.hysmart_forecast_models(company_id, project_id, model_type, trained_at desc);

create table if not exists public.hysmart_forecast_predictions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  model_id uuid not null references public.hysmart_forecast_models(id) on delete cascade,
  activity_id uuid not null references public.project_schedule_activities(id) on delete cascade,
  activity_name text not null default '',
  delay_probability numeric(7,6) not null check (delay_probability between 0 and 1),
  risk_level text not null check (risk_level in ('LOW','MEDIUM','HIGH')),
  features jsonb not null default '{}'::jsonb,
  explanation text not null default '',
  generated_at timestamptz not null default now(),
  constraint hysmart_forecast_predictions_company_project_fk foreign key (company_id, project_id) references public.projects(company_id, id) on delete cascade,
  constraint hysmart_forecast_predictions_model_tenant_fk foreign key (company_id, project_id, model_id) references public.hysmart_forecast_models(company_id, project_id, id) on delete cascade,
  constraint hysmart_forecast_predictions_activity_tenant_fk foreign key (company_id, project_id, activity_id) references public.project_schedule_activities(company_id, project_id, id) on delete cascade,
  constraint hysmart_forecast_predictions_model_activity_uq unique (model_id, activity_id)
);
create index if not exists hysmart_forecast_predictions_risk_idx on public.hysmart_forecast_predictions(company_id, project_id, risk_level, delay_probability desc);

alter table public.hysmart_forecast_models enable row level security;
alter table public.hysmart_forecast_predictions enable row level security;
drop policy if exists hysmart_forecast_models_company_read on public.hysmart_forecast_models;
create policy hysmart_forecast_models_company_read on public.hysmart_forecast_models for select using (public.is_company_member(company_id));
drop policy if exists hysmart_forecast_predictions_company_read on public.hysmart_forecast_predictions;
create policy hysmart_forecast_predictions_company_read on public.hysmart_forecast_predictions for select using (public.is_company_member(company_id));

insert into public.permissions (key, description) values
  ('intelligence-model:train', 'Train and evaluate project-scoped construction forecasting models')
on conflict (key) do update set description = excluded.description;

delete from public.role_permissions where permission_key = 'intelligence-model:train';
insert into public.role_permissions (role, permission_key) values
  ('SUPER_ADMIN','intelligence-model:train'),('COMPANY_OWNER','intelligence-model:train'),('COMPANY_ADMIN','intelligence-model:train'),
  ('CEO','intelligence-model:train'),('DIRECTOR','intelligence-model:train'),('MANAGEMENT','intelligence-model:train'),
  ('PROJECT_MANAGER','intelligence-model:train'),('CIVIL_ENGINEER','intelligence-model:train')
on conflict (role, permission_key) do nothing;

notify pgrst, 'reload schema';
commit;
