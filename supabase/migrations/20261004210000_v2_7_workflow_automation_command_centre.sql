begin;
create extension if not exists pgcrypto;

create table if not exists public.workflow_action_rules (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 name text not null, event_type text not null, enabled boolean not null default true,
 severity text not null default 'MEDIUM' check(severity in ('LOW','MEDIUM','HIGH','CRITICAL')),
 days_before integer not null default 0 check(days_before between -365 and 365),
 role_targets text[] not null default '{}', project_id uuid, config jsonb not null default '{}'::jsonb,
 created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(company_id,id)
);
alter table public.workflow_action_rules add constraint workflow_rule_project_tenant_fk foreign key(company_id,project_id) references public.projects(company_id,id) on delete cascade;

create table if not exists public.workflow_action_items (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 project_id uuid, rule_id uuid references public.workflow_action_rules(id) on delete set null,
 source_type text not null, source_id uuid, action_key text not null, title text not null, body text,
 severity text not null default 'MEDIUM' check(severity in ('LOW','MEDIUM','HIGH','CRITICAL')),
 assigned_to uuid references auth.users(id), status text not null default 'OPEN' check(status in ('OPEN','ACKNOWLEDGED','DONE','DISMISSED')),
 due_at timestamptz, acknowledged_at timestamptz, completed_at timestamptz, metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(company_id,action_key)
);
alter table public.workflow_action_items add constraint workflow_action_project_tenant_fk foreign key(company_id,project_id) references public.projects(company_id,id) on delete cascade;
alter table public.workflow_action_items add constraint workflow_action_rule_tenant_fk foreign key(company_id,rule_id) references public.workflow_action_rules(company_id,id) on delete set null;

create table if not exists public.workflow_notification_preferences (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade, in_app boolean not null default true,
 email boolean not null default false, push boolean not null default false, whatsapp boolean not null default false,
 quiet_hours_start time, quiet_hours_end time, digest_enabled boolean not null default true,
 unique(company_id,user_id)
);

create table if not exists public.workflow_automation_runs (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 run_key text not null, started_at timestamptz not null default now(), completed_at timestamptz,
 status text not null default 'RUNNING' check(status in ('RUNNING','COMPLETED','FAILED')),
 created_count integer not null default 0, metadata jsonb not null default '{}'::jsonb, error text,
 unique(company_id,run_key)
);

create index if not exists workflow_action_open_idx on public.workflow_action_items(company_id,status,severity,due_at);
create index if not exists workflow_action_project_idx on public.workflow_action_items(company_id,project_id,status,created_at desc);
create index if not exists workflow_rules_enabled_idx on public.workflow_action_rules(company_id,enabled,event_type);

alter table public.workflow_action_rules enable row level security;
alter table public.workflow_action_items enable row level security;
alter table public.workflow_notification_preferences enable row level security;
alter table public.workflow_automation_runs enable row level security;
create policy workflow_rules_member_all on public.workflow_action_rules for all using(public.is_company_member(company_id)) with check(public.is_company_member(company_id));
create policy workflow_actions_member_all on public.workflow_action_items for all using(public.is_company_member(company_id)) with check(public.is_company_member(company_id));
create policy workflow_prefs_self on public.workflow_notification_preferences for all using(public.is_company_member(company_id) and user_id=auth.uid()) with check(public.is_company_member(company_id) and user_id=auth.uid());
create policy workflow_runs_member_select on public.workflow_automation_runs for select using(public.is_company_member(company_id));

insert into public.permissions(key,description) values
 ('workflow:read','Read workflow action centre'),('workflow:manage','Manage workflow automation rules'),('workflow:execute','Run workflow automation'),('workflow:update','Update workflow action items')
on conflict(key) do update set description=excluded.description;
commit;
