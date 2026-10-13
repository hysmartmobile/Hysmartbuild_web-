-- V0.2 identity, tenant membership and RBAC foundation.
-- Passwords remain exclusively in Supabase Auth (auth.users).

create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  phone text,
  email text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('SUPER_ADMIN','COMPANY_OWNER','COMPANY_ADMIN','DIRECTOR','PROJECT_MANAGER','SITE_ENGINEER','SITE_SUPERVISOR','ACCOUNTANT','STOREKEEPER','HR_MANAGER','WORKER','CLIENT')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INVITED','SUSPENDED','REMOVED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, user_id)
);

create table public.permissions (
  key text primary key,
  description text not null
);

create table public.role_permissions (
  role text not null check (role in ('SUPER_ADMIN','COMPANY_OWNER','COMPANY_ADMIN','DIRECTOR','PROJECT_MANAGER','SITE_ENGINEER','SITE_SUPERVISOR','ACCOUNTANT','STOREKEEPER','HR_MANAGER','WORKER','CLIENT')),
  permission_key text not null references public.permissions(key) on delete cascade,
  primary key(role, permission_key)
);

insert into public.permissions(key, description) values
 ('company:read','Read company information'),
 ('company:update','Update company information'),
 ('user:create','Create or invite users'),
 ('user:read','Read company users'),
 ('user:update','Update company users'),
 ('project:create','Create projects'),
 ('project:read','Read projects'),
 ('project:update','Update projects'),
 ('project:delete','Delete projects'),
 ('report:create','Create daily reports'),
 ('report:read','Read daily reports'),
 ('report:update','Update daily reports'),
 ('report:approve','Approve daily reports'),
 ('expense:create','Create expenses'),
 ('expense:read','Read expenses'),
 ('expense:approve','Approve expenses'),
 ('material:create','Create material records'),
 ('material:read','Read material records'),
 ('material:issue','Issue materials'),
 ('material:receive','Receive materials')
on conflict (key) do nothing;

insert into public.role_permissions(role, permission_key)
select r.role, p.key
from (values
 ('COMPANY_OWNER'),('COMPANY_ADMIN'),('DIRECTOR'),('PROJECT_MANAGER'),('SITE_ENGINEER'),('SITE_SUPERVISOR'),('ACCOUNTANT'),('STOREKEEPER'),('HR_MANAGER'),('WORKER'),('CLIENT'),('SUPER_ADMIN')
) as r(role)
cross join public.permissions p
where r.role in ('COMPANY_OWNER','COMPANY_ADMIN')
on conflict do nothing;

create index company_members_user_idx on public.company_members(user_id);
create index company_members_company_idx on public.company_members(company_id);
create index company_members_user_company_idx on public.company_members(user_id, company_id);
create index companies_created_by_idx on public.companies(created_by);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do update set full_name = excluded.full_name, updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles for each row execute procedure public.set_updated_at();
drop trigger if exists companies_updated_at on public.companies;
create trigger companies_updated_at before update on public.companies for each row execute procedure public.set_updated_at();
drop trigger if exists company_members_updated_at on public.company_members;
create trigger company_members_updated_at before update on public.company_members for each row execute procedure public.set_updated_at();

create or replace function public.is_company_member(target_company uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.company_members cm
    where cm.company_id = target_company
      and cm.user_id = auth.uid()
      and cm.status = 'ACTIVE'
  );
$$;

create or replace function public.has_company_role(target_company uuid, target_role text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.company_members cm
    where cm.company_id = target_company
      and cm.user_id = auth.uid()
      and cm.status = 'ACTIVE'
      and cm.role = target_role
  );
$$;

alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.company_members enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;

create policy profiles_select_own on public.profiles for select using (id = auth.uid());
create policy profiles_update_own on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy companies_select_member on public.companies for select using (public.is_company_member(id));
create policy companies_insert_authenticated on public.companies for insert with check (created_by = auth.uid());
create policy companies_update_owner_admin on public.companies for update using (public.has_company_role(id, 'COMPANY_OWNER') or public.has_company_role(id, 'COMPANY_ADMIN')) with check (public.is_company_member(id));

create policy members_select_member on public.company_members for select using (user_id = auth.uid() or public.is_company_member(company_id));
create policy members_insert_owner_admin on public.company_members for insert with check (public.has_company_role(company_id, 'COMPANY_OWNER') or public.has_company_role(company_id, 'COMPANY_ADMIN'));
create policy members_update_owner_admin on public.company_members for update using (public.has_company_role(company_id, 'COMPANY_OWNER') or public.has_company_role(company_id, 'COMPANY_ADMIN')) with check (public.is_company_member(company_id));

create policy permissions_read_authenticated on public.permissions for select to authenticated using (true);
create policy role_permissions_read_authenticated on public.role_permissions for select to authenticated using (true);
