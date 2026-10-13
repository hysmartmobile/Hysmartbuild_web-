-- V3.5 Revenue & Margin Protection / Construction Truth signals
begin;
create table if not exists public.project_value_protection_events (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 project_id uuid not null references public.projects(id) on delete cascade,
 type text not null check(type in ('REVENUE','VARIATION','MARGIN','CASH','PROCUREMENT','PRODUCTIVITY','CONTRACT','RISK')),
 title text not null,
 detected_value numeric(20,4) not null default 0,
 realized_value numeric(20,4),
 currency text not null default 'NGN',
 status text not null default 'DETECTED' check(status in ('DETECTED','ACCEPTED','REALIZED','CLOSED','DISMISSED')),
 source text not null default 'REVENUE_MARGIN_INTELLIGENCE',
 owner_user_id uuid references auth.users(id),
 notes text,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists project_value_protection_events_idx on public.project_value_protection_events(company_id,project_id,status,created_at desc);
alter table public.project_value_protection_events enable row level security;
drop policy if exists project_value_protection_events_member_all on public.project_value_protection_events;
create policy project_value_protection_events_member_all on public.project_value_protection_events for all using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));
insert into public.permissions(key,description) values ('commercial-intelligence:read','View revenue, margin, change and value-protection intelligence'),('commercial-intelligence:manage','Record and manage value-protection events') on conflict(key) do update set description=excluded.description;
delete from public.role_permissions where permission_key in ('commercial-intelligence:read','commercial-intelligence:manage');
insert into public.role_permissions(role,permission_key) values
('SUPER_ADMIN','commercial-intelligence:read'),('SUPER_ADMIN','commercial-intelligence:manage'),
('COMPANY_OWNER','commercial-intelligence:read'),('COMPANY_OWNER','commercial-intelligence:manage'),
('COMPANY_ADMIN','commercial-intelligence:read'),('COMPANY_ADMIN','commercial-intelligence:manage'),
('DIRECTOR','commercial-intelligence:read'),('DIRECTOR','commercial-intelligence:manage'),
('PROJECT_MANAGER','commercial-intelligence:read'),('PROJECT_MANAGER','commercial-intelligence:manage'),
('ACCOUNTANT','commercial-intelligence:read'),('ACCOUNTANT','commercial-intelligence:manage');
commit;
