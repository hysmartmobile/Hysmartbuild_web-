begin;
insert into public.permissions(key,description) values
('operating-system:read','View the unified Construction Operating System and daily command centre')
on conflict(key) do update set description=excluded.description;
delete from public.role_permissions where permission_key='operating-system:read';
insert into public.role_permissions(role,permission_key) values
('SUPER_ADMIN','operating-system:read'),('COMPANY_OWNER','operating-system:read'),('COMPANY_ADMIN','operating-system:read'),('DIRECTOR','operating-system:read'),('PROJECT_MANAGER','operating-system:read'),('SITE_ENGINEER','operating-system:read'),('SITE_SUPERVISOR','operating-system:read'),('ACCOUNTANT','operating-system:read'),('STOREKEEPER','operating-system:read'),('HR_MANAGER','operating-system:read');
notify pgrst,'reload schema';
commit;

begin;
create table if not exists public.operational_inbox_messages (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 source text not null default 'FIELD_MESSAGE', sender_user_id uuid references auth.users(id), raw_text text not null,
 class_type text not null default 'NOTE' check(class_type in ('NOTE','MATERIAL_RISK','SCHEDULE_RISK','SAFETY','QUALITY','COMMERCIAL')),
 metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists operational_inbox_company_created_idx on public.operational_inbox_messages(company_id,created_at desc);
alter table public.operational_inbox_messages enable row level security;
drop policy if exists operational_inbox_member_all on public.operational_inbox_messages;
create policy operational_inbox_member_all on public.operational_inbox_messages for all using(public.is_company_member(company_id)) with check(public.is_company_member(company_id));
notify pgrst,'reload schema';
commit;
