-- V5.6.1 — Access lifecycle, reversible partner/member removal, and audit reasons.
begin;

alter table public.company_invitations add column if not exists revoked_by uuid references auth.users(id);
alter table public.company_invitations add column if not exists revoked_at timestamptz;
alter table public.company_invitations add column if not exists revocation_reason text;
alter table public.company_invitations add constraint company_invitation_revocation_reason_check check (revocation_reason is null or char_length(trim(revocation_reason)) between 3 and 1000);

alter table public.company_members add column if not exists access_suspended_by uuid references auth.users(id);
alter table public.company_members add column if not exists access_suspended_at timestamptz;
alter table public.company_members add column if not exists access_suspension_reason text;
alter table public.company_members add constraint company_member_suspension_reason_check check (access_suspension_reason is null or char_length(trim(access_suspension_reason)) between 3 and 1000);

create table if not exists public.company_access_lifecycle_events (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 target_user_id uuid references auth.users(id) on delete set null,
 invitation_id uuid references public.company_invitations(id) on delete set null,
 action text not null check (action in ('INVITATION_REVOKED','MEMBER_SUSPENDED','MEMBER_REACTIVATED')),
 reason text not null check (char_length(trim(reason)) between 3 and 1000),
 actor_user_id uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
create index if not exists company_access_lifecycle_company_idx on public.company_access_lifecycle_events(company_id,created_at desc);
create index if not exists company_access_lifecycle_target_idx on public.company_access_lifecycle_events(company_id,target_user_id,created_at desc);
alter table public.company_access_lifecycle_events enable row level security;
drop policy if exists company_access_lifecycle_read on public.company_access_lifecycle_events;
create policy company_access_lifecycle_read on public.company_access_lifecycle_events for select using (public.is_company_member(company_id));
drop policy if exists company_access_lifecycle_write on public.company_access_lifecycle_events;
create policy company_access_lifecycle_write on public.company_access_lifecycle_events for insert with check (public.is_company_network_manager(company_id));

insert into public.permissions(key,description) values ('user:manage','Suspend or reactivate company member access') on conflict(key) do update set description=excluded.description;
delete from public.role_permissions where permission_key='user:manage';
insert into public.role_permissions(role,permission_key) values
 ('SUPER_ADMIN','user:manage'),('COMPANY_OWNER','user:manage'),('COMPANY_ADMIN','user:manage'),('DIRECTOR','user:manage')
on conflict do nothing;

commit;
