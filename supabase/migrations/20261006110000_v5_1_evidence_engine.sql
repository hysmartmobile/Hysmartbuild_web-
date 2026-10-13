-- HySmart Build V5.1 — Construction Evidence Engine
begin;
create extension if not exists pgcrypto;
create table if not exists public.construction_evidence_items (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 project_id uuid not null, source_type text not null, source_id uuid, evidence_type text not null,
 title text not null, description text, tags jsonb not null default '[]'::jsonb, captured_by uuid references auth.users(id),
 occurred_at timestamptz not null default now(), metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table if not exists public.construction_evidence_packs (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 project_id uuid not null, pack_type text not null default 'CLAIM_EVIDENCE', title text not null,
 status text not null default 'DRAFT' check(status in ('DRAFT','REVIEWED','APPROVED','ARCHIVED')),
 generated_by uuid references auth.users(id), payload jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.construction_evidence_items add constraint evidence_item_project_tenant_fk foreign key(company_id,project_id) references public.projects(company_id,id) on delete cascade;
alter table public.construction_evidence_packs add constraint evidence_pack_project_tenant_fk foreign key(company_id,project_id) references public.projects(company_id,id) on delete cascade;
create index if not exists construction_evidence_items_project_time_idx on public.construction_evidence_items(company_id,project_id,occurred_at desc);
create index if not exists construction_evidence_items_source_idx on public.construction_evidence_items(company_id,source_type,source_id);
create index if not exists construction_evidence_packs_project_time_idx on public.construction_evidence_packs(company_id,project_id,created_at desc);
alter table public.construction_evidence_items enable row level security;
alter table public.construction_evidence_packs enable row level security;
drop policy if exists construction_evidence_items_member_all on public.construction_evidence_items;
drop policy if exists construction_evidence_packs_member_all on public.construction_evidence_packs;
create policy construction_evidence_items_member_all on public.construction_evidence_items for all using(public.is_company_member(company_id)) with check(public.is_company_member(company_id));
create policy construction_evidence_packs_member_all on public.construction_evidence_packs for all using(public.is_company_member(company_id)) with check(public.is_company_member(company_id));
insert into public.permissions(key,description) values ('evidence:read','Read construction evidence and chronology'),('evidence:manage','Create evidence records and evidence packs') on conflict(key) do update set description=excluded.description;
insert into public.role_permissions(role,permission_key) values
('SUPER_ADMIN','evidence:read'),('SUPER_ADMIN','evidence:manage'),('COMPANY_OWNER','evidence:read'),('COMPANY_OWNER','evidence:manage'),('COMPANY_ADMIN','evidence:read'),('COMPANY_ADMIN','evidence:manage'),('DIRECTOR','evidence:read'),('DIRECTOR','evidence:manage'),('PROJECT_MANAGER','evidence:read'),('PROJECT_MANAGER','evidence:manage'),('SITE_ENGINEER','evidence:read'),('SITE_ENGINEER','evidence:manage'),('SITE_SUPERVISOR','evidence:read'),('SITE_SUPERVISOR','evidence:manage'),('ACCOUNTANT','evidence:read') on conflict do nothing;
commit;
